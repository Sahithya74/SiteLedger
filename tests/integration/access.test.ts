import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { archiveProject, createProject, getProject, listProjects, updateProject } from "@/server/services/projects";
import { listUsers, setManagerPermissions } from "@/server/services/users";
import { makeProject, makeUser } from "./helpers";

describe("manager access", () => {
  it("only sees assigned projects", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId: assigned } = await makeProject(owner, { name: "Assigned" });
    const { projectId: other } = await makeProject(owner, { name: "Not assigned" });
    const manager = await makeUser("MANAGER", { permissions: ["work.manage"] });
    await db.projectAssignment.create({ data: { userId: manager.id, projectId: assigned } });

    expect((await listProjects(manager)).map((p) => p.name)).toEqual(["Assigned"]);
    expect(await getProject(manager, other)).toBeNull();
    expect(await getProject(manager, assigned)).not.toBeNull();
    // The owner sees both.
    expect((await listProjects(owner)).length).toBe(2);
  });

  it("can see all projects when allowed", async () => {
    const owner = await makeUser("ADMIN");
    await makeProject(owner);
    const manager = await makeUser("MANAGER", { permissions: ["projects.viewAll"] });
    expect((await listProjects(manager)).length).toBe(1);
  });

  it("cannot create projects without permission", async () => {
    const owner = await makeUser("ADMIN");
    const { clientId } = await makeProject(owner);
    const manager = await makeUser("MANAGER", { permissions: ["work.manage"] });
    await expect(
      createProject(manager, {
        name: "Sneaky",
        clientId,
        type: "OTHER",
        status: "PLANNING",
        description: null,
        address: null,
        city: null,
        state: null,
        pincode: null,
        latitude: null,
        longitude: null,
        mapUrl: null,
        startDate: null,
        expectedEndDate: null,
        actualEndDate: null,
        quotedPaise: 0n,
        contractPaise: 0n,
        statusNote: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("can never archive projects, even if the permission row is forced into the database", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId } = await makeProject(owner);
    const manager = await makeUser("MANAGER", { permissions: ["projects.viewAll"] });
    await db.userPermission.create({ data: { userId: manager.id, permission: "projects.archive" } });
    await expect(archiveProject({ ...manager, permissions: [...manager.permissions, "projects.archive"] }, projectId, null)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("cannot change contract amounts without money permission", async () => {
    const owner = await makeUser("ADMIN");
    const { projectId, clientId } = await makeProject(owner, { contractLakhs: 25 });
    const manager = await makeUser("MANAGER", { permissions: ["projects.edit", "projects.viewAll"] });
    const before = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    await updateProject(manager, projectId, {
      name: "Renamed by manager",
      clientId,
      type: before.type,
      status: before.status,
      description: null,
      address: null,
      city: before.city,
      state: null,
      pincode: null,
      latitude: null,
      longitude: null,
      mapUrl: null,
      startDate: null,
      expectedEndDate: null,
      actualEndDate: null,
      quotedPaise: 0n,
      contractPaise: 1n, // attempt to change the amount
      statusNote: null,
    });
    const after = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(after.name).toBe("Renamed by manager");
    expect(after.contractPaise).toBe(before.contractPaise);
  });

  it("only the owner manages users, and admin-only permissions are never saved for a manager", async () => {
    const owner = await makeUser("ADMIN");
    const manager = await makeUser("MANAGER");
    await expect(listUsers(manager)).rejects.toBeInstanceOf(ForbiddenError);
    await setManagerPermissions(owner, manager.id, ["work.manage", "users.manage", "finance.reverse"]);
    const saved = await db.userPermission.findMany({ where: { userId: manager.id } });
    expect(saved.map((p) => p.permission)).toEqual(["work.manage"]);
    expect(await db.auditLog.count({ where: { action: "PERMISSION_CHANGE" } })).toBe(1);
  });
});
