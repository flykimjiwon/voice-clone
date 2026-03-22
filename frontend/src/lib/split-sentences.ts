export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const matches = normalized.match(
    /.+?(?:[.!?。！？](?=\s|$)|(?:습니다|ㅂ니다|니다|어요|아요|다|요|죠|네|까)(?=\s|$)|\n|$)/gu,
  );

  if (!matches) return [];

  return matches.map((sentence) => sentence.trim()).filter(Boolean);
}
