import { z } from 'zod'

const NonEmptyStringSchema = z.string().min(1)
const LocalPathSchema = NonEmptyStringSchema.startsWith('./')

export type Externals = z.infer<typeof ExternalsSchema>
export const ExternalsSchema = z.record(
  LocalPathSchema,
  z.object({
    path: LocalPathSchema,
    repo: NonEmptyStringSchema,
    ref: NonEmptyStringSchema
  })
)
