"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {containsLink, containsProfanity, detectViolation, sanitizeDisplayName} = require("../moderation");

test("blocks common Russian profanity, including punctuation-separated spelling", () => {
  assert.equal(containsProfanity("сука"), true);
  assert.equal(containsProfanity("бля"), true);
  assert.equal(containsProfanity("б л я д ь"), true);
  assert.equal(detectViolation("это плохо"), null);
});

test("blocks links with a protocol and bare domains", () => {
  assert.equal(containsLink("https://example.com/page"), true);
  assert.equal(containsLink("Заходи на example.ru"), true);
  assert.equal(containsLink("example точка com"), true);
  assert.equal(containsLink("192.168.0.1"), true);
  assert.equal(containsLink("Windows 11, сборка 10.0.22631.3155"), false);
  assert.equal(containsLink("Windows 11 сегодня"), false);
});

test("detects links and profanity in either the message or display name", () => {
  assert.equal(detectViolation("Привет", "https://example.org"), "link");
  assert.equal(detectViolation("сука"), "profanity");
});

test("sanitizes and bounds display names", () => {
  assert.equal(sanitizeDisplayName("  <Гость>  \nНовый  ", "user-1234"), "Гость Новый");
  assert.equal(sanitizeDisplayName("", "abcdefgh"), "Гость-efgh");
  assert.equal(sanitizeDisplayName("Очень длинное имя пользователя 123", "uid").length, 24);
});
