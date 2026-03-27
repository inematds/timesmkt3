/**
 * Formats text for Telegram messages.
 * Converts basic Markdown to Telegram HTML and splits long messages.
 */

const MAX_LENGTH = 4096;

/**
 * Convert markdown to Telegram-safe HTML.
 */
function toTelegramHTML(text) {
  // Protect code blocks
  const codeBlocks = [];
  let result = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Escape HTML in remaining text
  result = escapeHtml(result);

  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  // Italic
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');

  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Headers → bold
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    result = result.replace(`%%CODEBLOCK_${i}%%`, block);
  });

  // Collapse excessive newlines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Split long text into chunks that fit Telegram's 4096 char limit.
 */
function splitMessage(text) {
  if (text.length <= MAX_LENGTH) return [text];

  const parts = [];
  let remaining = text;

  while (remaining.length > MAX_LENGTH) {
    const chunk = remaining.slice(0, MAX_LENGTH);
    const lastNewline = chunk.lastIndexOf('\n');
    const splitAt = lastNewline > MAX_LENGTH / 2 ? lastNewline : MAX_LENGTH;
    parts.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

module.exports = { toTelegramHTML, splitMessage, escapeHtml };
