import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listVendorContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("vendor_contacts")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertVendorContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      location_id: z.string().uuid(),
      name: z.string().min(1).max(200),
      category: z.string().min(1).max(80),
      phone: z.string().max(40).optional().nullable(),
      email: z.string().max(255).optional().nullable(),
      contact_person: z.string().max(200).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
      active: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      location_id: data.location_id,
      name: data.name,
      category: data.category,
      phone: data.phone || null,
      email: data.email || null,
      contact_person: data.contact_person || null,
      notes: data.notes || null,
      active: data.active,
    };
    if (data.id) {
      const { error } = await context.supabase.from("vendor_contacts").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("vendor_contacts").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteVendorContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vendor_contacts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });