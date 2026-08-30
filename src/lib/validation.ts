import z from "zod";


export const DefaultDateSchema = z.coerce.date().default(() => new Date());
