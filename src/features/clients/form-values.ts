// Plain module (no "use client") so server pages can use these values directly.

export type ClientFormValues = {
  name: string;
  phone: string;
  altPhone: string;
  email: string;
  address: string;
  city: string;
  gstin: string;
  pan: string;
  notes: string;
};

export const EMPTY_CLIENT: ClientFormValues = {
  name: "",
  phone: "",
  altPhone: "",
  email: "",
  address: "",
  city: "",
  gstin: "",
  pan: "",
  notes: "",
};
