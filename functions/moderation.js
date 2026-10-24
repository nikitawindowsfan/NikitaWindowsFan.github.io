"use strict";

const CONFUSABLES = Object.freeze({
  a: "а",
  e: "е",
  o: "о",
  p: "р",
  c: "с",
  x: "х",
  y: "у",
  k: "к",
  m: "м",
  t: "т",
  b: "в",
  h: "н",
  i: "и",
  0: "о",
  3: "з",
  4: "ч",
  5: "с",
  6: "б",
  8: "в",
  "@": "а",
  $: "с",
  "!": "и"
});

const RU_PROFANITY = /(?:бля(?:д|т)?|сука|сучк|ху(?:й|я|е|и|л)|хер|пизд|ёб|еб(?:а|л|у|и|н|т|ч)|мудак|пидор|пидр|гандон|залуп|шлюх|мраз)/iu;
const EN_PROFANITY = /(?:fuck|shit|bitch|cunt|motherfucker|asshole)/i;
const URL_PATTERN = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59}|рф)(?::\d{2,5})?(?:[/?#][^\s]*)?/iu;
const SPOKEN_LINK_PATTERN = /(?:^|[^\p{L}\p{N}_])(?:точка|dot)\s*(?:ru|com|net|org|io|info|рф)(?=$|[^\p{L}\p{N}_])/iu;
const IPV4_PATTERN = /(?:^|[^\p{L}\p{N}])((?:\d{1,3}\.){3}\d{1,3})(?=$|[^\p{L}\p{N}])/gu;

function normalizeForModeration(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/[ё]/gu, "е")
    .replace(/[a-z0-9@$!]/giu, char => CONFUSABLES[char.toLowerCase()] || char)
    .replace(/[\u200B-\u200D\uFEFF]/gu, "");
}

function containsProfanity(value) {
  const raw = String(value ?? "").normalize("NFKC").toLocaleLowerCase("ru-RU");
  const rawCompact = raw.replace(/[^\p{L}\p{N}]/gu, "");
  const normalized = normalizeForModeration(raw);
  // Removing separators catches simple attempts such as "б л я д ь".
  const compact = normalized.replace(/[^\p{L}\p{N}]/gu, "");
  return EN_PROFANITY.test(rawCompact) || RU_PROFANITY.test(normalized) || RU_PROFANITY.test(compact);
}

function containsIpv4(value) {
  for (const match of value.matchAll(IPV4_PATTERN)) {
    if (match[1].split(".").every(part => Number(part) <= 255)) return true;
  }
  return false;
}

function containsLink(value) {
  const raw = String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/[ё]/gu, "е")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "");
  // Also reject URLs split up with spaces, for example "https : // example . com".
  const compact = raw.replace(/\s+/gu, "");
  return URL_PATTERN.test(raw)
    || URL_PATTERN.test(compact)
    || SPOKEN_LINK_PATTERN.test(raw)
    || containsIpv4(raw);
}

function detectViolation(text, displayName = "") {
  const combined = `${displayName} ${text}`;
  if (containsLink(combined)) return "link";
  if (containsProfanity(combined)) return "profanity";
  return null;
}

function sanitizeDisplayName(value, uid = "guest") {
  const clean = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F<>]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 24);
  return clean || `Гость-${String(uid).slice(-4)}`;
}

module.exports = {
  containsLink,
  containsProfanity,
  detectViolation,
  normalizeForModeration,
  sanitizeDisplayName
};
