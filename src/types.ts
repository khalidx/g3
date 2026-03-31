import { z } from 'zod'

const NonEmptyStringSchema = z.string().min(1)
const LocalPathSchema = NonEmptyStringSchema.startsWith('./')

export type External = { target: string, source: Externals[string] }
export type Externals = z.infer<typeof ExternalsSchema>
export const ExternalsSchema = z.record(
  LocalPathSchema,
  z.object({
    repo: NonEmptyStringSchema,
    path: LocalPathSchema,
    ref: NonEmptyStringSchema
  })
)

export type Command = z.infer<typeof CommandSchema>
export const CommandSchema = z.object({
  name: NonEmptyStringSchema,
  handler: (
    z.function()
    .input([ z.object({ values: z.object({ json: z.boolean() }) }) ])
    .output(z.promise(z.void()))
  )
})
