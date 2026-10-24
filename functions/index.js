"use strict";

const {initializeApp} = require("firebase-admin/app");
const {FieldValue, Timestamp, getFirestore} = require("firebase-admin/firestore");
const {HttpsError, onCall} = require("firebase-functions/v2/https");
const {detectViolation, sanitizeDisplayName} = require("./moderation");

initializeApp();
const db = getFirestore();
const MESSAGE_LIMIT = 500;
const MIN_MESSAGE_INTERVAL_MS = 1500;
const STRIKE_RESET_MS = 30 * 24 * 60 * 60 * 1000;
const BAN_DURATIONS_MS = [10 * 60 * 1000, 60 * 60 * 1000, 24 * 60 * 60 * 1000];

function timestampMillis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

function temporaryBanError(bannedUntil) {
  throw new HttpsError(
    "permission-denied",
    "За нарушение правил отправка сообщений временно заблокирована.",
    {code: "TEMP_BANNED", bannedUntil}
  );
}

exports.sendChatMessage = onCall({region: "us-central1", maxInstances: 10}, async request => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Для отправки сообщения войдите как гость.");
  }

  const payload = request.data && typeof request.data === "object" ? request.data : {};
  const text = String(payload.text ?? "").trim();
  if (!text) {
    throw new HttpsError("invalid-argument", "Сообщение не может быть пустым.");
  }
  if (text.length > MESSAGE_LIMIT) {
    throw new HttpsError("invalid-argument", `Максимальная длина сообщения — ${MESSAGE_LIMIT} символов.`);
  }

  const displayName = sanitizeDisplayName(payload.displayName, uid);
  const violation = detectViolation(text, displayName);
  const now = Date.now();
  const moderationRef = db.collection("chatModeration").doc(uid);
  const messageRef = db.collection("chatMessages").doc();

  let result;
  try {
    result = await db.runTransaction(async transaction => {
      const moderationSnapshot = await transaction.get(moderationRef);
      const moderation = moderationSnapshot.exists ? moderationSnapshot.data() : {};
      const activeBanUntil = timestampMillis(moderation.bannedUntil);

      if (activeBanUntil > now) {
        return {kind: "banned", bannedUntil: activeBanUntil};
      }

      if (violation) {
        const lastViolationAt = timestampMillis(moderation.lastViolationAt);
        const previousStrikes = lastViolationAt && now - lastViolationAt < STRIKE_RESET_MS
          ? Number(moderation.violations) || 0
          : 0;
        const strikes = previousStrikes + 1;
        const duration = BAN_DURATIONS_MS[Math.min(strikes - 1, BAN_DURATIONS_MS.length - 1)];
        const bannedUntil = now + duration;

        transaction.set(moderationRef, {
          uid,
          violations: strikes,
          lastViolationAt: Timestamp.fromMillis(now),
          lastViolationReason: violation,
          bannedUntil: Timestamp.fromMillis(bannedUntil)
        }, {merge: true});

        return {kind: "violation", bannedUntil, reason: violation};
      }

      const lastSentAt = timestampMillis(moderation.lastSentAt);
      if (lastSentAt && now - lastSentAt < MIN_MESSAGE_INTERVAL_MS) {
        return {kind: "slow"};
      }

      transaction.create(messageRef, {
        uid,
        displayName,
        text,
        createdAt: FieldValue.serverTimestamp()
      });
      transaction.set(moderationRef, {
        uid,
        lastSentAt: Timestamp.fromMillis(now)
      }, {merge: true});
      return {kind: "sent"};
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("Failed to process chat message", error);
    throw new HttpsError("internal", "Не удалось отправить сообщение.");
  }

  if (result.kind === "banned" || result.kind === "violation") {
    temporaryBanError(result.bannedUntil);
  }
  if (result.kind === "slow") {
    throw new HttpsError("resource-exhausted", "Отправляйте сообщения немного реже.", {code: "SLOW_DOWN"});
  }

  return {ok: true};
});
