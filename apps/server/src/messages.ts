import { z } from "zod"
import { ROOM_ALPHABET } from "./codes.ts"
import { config } from "./config.ts"
import type { TimingConfig } from "./config.ts"

const NAME_LENGTH = "Name must be 1 to 20 characters"
const NAME_CONTROL = "Name cannot contain control characters"
const ROUNDS = "Rounds must be a whole number from 1 to 99"

const displayName = z.string().transform((value, ctx) => {
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > 20) {
    ctx.addIssue({ code: "custom", message: NAME_LENGTH })
    return z.NEVER
  }
  if (/\p{Cc}/u.test(trimmed)) {
    ctx.addIssue({ code: "custom", message: NAME_CONTROL })
    return z.NEVER
  }
  return trimmed
})

const playerId = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => !/\p{Cc}/u.test(value), "Invalid message")

const secretHash = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64}$/, "Invalid message")
  .transform((value) => value.toLowerCase())

const createBody = z.object({
  name: displayName,
  playerId,
  secretHash,
})

export type CreateBody = z.infer<typeof createBody>

export type ClientMessage =
  | { type: "join"; playerId: string; secret: string; name: string; pin?: string; claimCode?: string }
  | { type: "set_rounds"; rounds: number }
  | { type: "move_seat"; from: number; to: number }
  | { type: "remove_player"; seat: number }
  | { type: "release_seat"; seat: number }
  | { type: "start_match" }

export type ParseResult = { ok: true; data: ClientMessage } | { ok: false; message: string }

export function parseCreateBody(input: unknown): { ok: true; data: CreateBody } | { ok: false; message: string } {
  const parsed = createBody.safeParse(input)
  if (!parsed.success) return failure(parsed.error)
  return { ok: true, data: parsed.data }
}

export function parseClientMessage(input: unknown, timing: TimingConfig = config): ParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input) || !("type" in input)) {
    return { ok: false, message: "Invalid message" }
  }
  const type = input.type
  const parsed =
    type === "join"
      ? joinSchema(timing).safeParse(input)
      : type === "set_rounds"
        ? roundsSchema.safeParse(input)
        : type === "move_seat"
          ? moveSchema.safeParse(input)
          : type === "remove_player"
            ? seatSchema("remove_player").safeParse(input)
            : type === "release_seat"
              ? seatSchema("release_seat").safeParse(input)
              : type === "start_match"
                ? z.object({ type: z.literal("start_match") }).safeParse(input)
                : null
  if (!parsed) return { ok: false, message: "Invalid message" }
  if (!parsed.success) return failure(parsed.error)
  return { ok: true, data: parsed.data }
}

function joinSchema(timing: TimingConfig) {
  return z.object({
    type: z.literal("join"),
    playerId,
    secret: z.string().min(1).max(200),
    name: displayName,
    pin: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    claimCode: z
      .string()
      .regex(new RegExp(`^[${ROOM_ALPHABET}]{${timing.claimCodeLength}}$`))
      .optional(),
  })
}

const roundsSchema = z.object({
  type: z.literal("set_rounds"),
  rounds: z.number().superRefine((value, ctx) => {
    if (!Number.isInteger(value) || value < 1 || value > 99) {
      ctx.addIssue({ code: "custom", message: ROUNDS })
    }
  }),
})

const moveSchema = z.object({
  type: z.literal("move_seat"),
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
})

function seatSchema(type: "remove_player" | "release_seat") {
  return z.object({
    type: z.literal(type),
    seat: z.number().int().nonnegative(),
  })
}

function failure(error: z.ZodError): { ok: false; message: string } {
  return { ok: false, message: error.issues[0]?.message ?? "Invalid message" }
}
