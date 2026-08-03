// 친구 초대 방의 서버 공유 저장소 — 로그인 없이 방 코드로 접근.
//
// 저장 백엔드는 환경에 따라 자동 선택된다:
//  - Upstash Redis 환경변수가 있으면(Vercel 배포) Redis에 보관
//  - 없으면(로컬 dev) 로컬 파일 .data/rooms/<code>.json에 보관
// 호출부는 백엔드를 몰라도 된다.

import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import type { Room } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data", "rooms");

/** 데모용 방 보관 기간 — 이 기간 지나면 Redis에서 자동 삭제 */
const ROOM_TTL_SECONDS = 60 * 60 * 24 * 30; // 30일

// 헷갈리는 글자(0/O, 1/I) 제외한 방 코드 문자셋
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

// Upstash 공식 통합은 UPSTASH_*, Vercel KV 스타일 통합은 KV_REST_API_* 이름을 쓴다
const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

function redisKey(code: string): string {
  return `morgo:room:${code}`;
}

function fileFor(code: string): string {
  return path.join(DATA_DIR, `${code}.json`);
}

/** 방 코드 형식 검증 (경로 조작 방지 겸용) */
export function isValidCode(code: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code);
}

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export async function readRoom(code: string): Promise<Room | null> {
  if (!isValidCode(code)) return null;
  if (redis) {
    return (await redis.get<Room>(redisKey(code))) ?? null;
  }
  try {
    const raw = await fs.readFile(fileFor(code), "utf8");
    return JSON.parse(raw) as Room;
  } catch {
    return null;
  }
}

export async function writeRoom(room: Room): Promise<void> {
  if (redis) {
    await redis.set(redisKey(room.code), room, { ex: ROOM_TTL_SECONDS });
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(fileFor(room.code), JSON.stringify(room), "utf8");
}

/** 아직 안 쓰인 방 코드를 하나 생성 (충돌 시 재시도) */
export async function allocateCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const existing = await readRoom(code);
    if (!existing) return code;
  }
  // 극히 드문 연속 충돌 — 마지막 시도값을 그대로 반환
  return randomCode();
}

/**
 * 방을 읽어 mutate 콜백으로 수정한 뒤 저장한다. (읽기-수정-쓰기 헬퍼)
 * 방이 없으면 null 반환. 알파 수준의 낮은 동시성 가정 — 락은 두지 않는다.
 */
export async function updateRoom(
  code: string,
  mutate: (room: Room) => void,
): Promise<Room | null> {
  const room = await readRoom(code);
  if (!room) return null;
  mutate(room);
  await writeRoom(room);
  return room;
}
