import z from "zod";

// Accepts Date | ISO string → outputs Date
export const DateField = z
  .union([
    z.date().transform(d => d.toISOString()),
    z.string()
  ])
  .pipe(z.iso.datetime());