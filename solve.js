// Fast drop-in for csv-reader 1.0.0: run(input) returns exactly csv-reader's
// {columns, rows, errors} for {text, header}, but parses with indexOf/slice/
// split jumps instead of one character at a time.
//
// Two paths per record. Fast path: the record's line holds no quote and no stray
// CR, so it is one slice + split(','). Slow path: field by field, with quoted
// fields found by indexOf('"') jumps (doubled quotes joined, CR/CRLF inside
// normalised to LF, line count kept exact) and unquoted fields found by
// indexOf(',')/indexOf('\n'). The outer decision and the field-segment searches
// are bounded to the current line or field; the unquoted delimiter search stops
// at the next comma or newline, which is near in every generator-drawn set (and
// measured fast even on adversarial comma-free inputs, where a single-byte
// search runs at memchr speed). Field results travel as the value string plus
// closure variables (fieldEnded/fieldAdded) so the hot loop allocates nothing
// per field.
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];

  let columns = null;
  let width = -1;
  let pos = 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;
  let fieldEnded = END;
  let fieldAdded = 0;

  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  function readUnquotedInto(initialValue) {
    const comma = text.indexOf(',', pos);
    const nl2 = text.indexOf('\n', pos);
    let end = len;
    let ended = END;
    if (comma !== -1 && (nl2 === -1 || comma < nl2)) {
      end = comma;
      ended = COMMA;
    } else if (nl2 !== -1) {
      end = nl2;
      ended = LINE_BREAK;
    }
    let fieldEnd = end;
    if (ended === LINE_BREAK && end > pos && text.charCodeAt(end - 1) === 13) {
      fieldEnd = end - 1;
    }
    // The segment slice bounds the stray-CR search to this field only.
    const seg = text.slice(pos, fieldEnd);
    let value = initialValue;
    let added = 0;
    let cr = seg.indexOf('\r');
    if (cr === -1) {
      value += seg;
      added += seg.length;
    } else {
      let last = 0;
      while (cr !== -1) {
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        value += seg.slice(last, cr);
        added += cr - last;
        last = cr + 1;
        cr = seg.indexOf('\r', last);
      }
      value += seg.slice(last);
      added += seg.length - last;
    }
    if (ended === COMMA) {
      pos = end + 1;
    } else if (ended === LINE_BREAK) {
      pos = end + 1;
      line += 1;
    } else {
      pos = len;
    }
    fieldEnded = ended;
    fieldAdded = added;
    return value;
  }

  function readQuotedField() {
    const open = pos;
    const openLine = line;

    let segStart = open + 1;
    let segments = null;
    let closeIdx = -1;
    let idx = text.indexOf('"', segStart);

    while (idx !== -1) {
      if (text.charCodeAt(idx + 1) === 34) {
        if (segments === null) segments = [];
        segments.push(text.slice(segStart, idx));
        segStart = idx + 2;
        idx = text.indexOf('"', segStart);
      } else {
        closeIdx = idx;
        break;
      }
    }

    if (closeIdx === -1) {
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      pos = open + 1;
      line = openLine;
      return readUnquotedInto('"');
    }

    let value;
    if (segments === null) {
      value = text.slice(open + 1, closeIdx);
    } else {
      segments.push(text.slice(segStart, closeIdx));
      value = segments.join('"');
    }

    if (value.indexOf('\r') !== -1) {
      value = value.replace(/\r\n?/g, '\n');
    }

    for (
      let lf = value.indexOf('\n');
      lf !== -1;
      lf = value.indexOf('\n', lf + 1)
    ) {
      line += 1;
    }

    pos = closeIdx + 1;

    if (pos >= len) {
      fieldEnded = END;
      fieldAdded = 0;
      return value;
    }

    const c = text.charCodeAt(pos);

    if (c === 44) {
      pos += 1;
      fieldEnded = COMMA;
      fieldAdded = 0;
      return value;
    }

    if (c === 10) {
      pos += 1;
      line += 1;
      fieldEnded = LINE_BREAK;
      fieldAdded = 0;
      return value;
    }

    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fieldEnded = LINE_BREAK;
      fieldAdded = 0;
      return value;
    }

    const junk = readUnquotedInto(value);
    if (fieldAdded > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    return junk;
  }

  function finishRecord(fields) {
    if (width < 0) width = fields.length;

    if (header && columns === null) {
      columns = fields;
      return;
    }

    if (fields.length < width) {
      errors.push({
        code: 'short_row',
        line: recordLine,
        row: recordRow,
        fields: fields.length
      });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({
        code: 'long_row',
        line: recordLine,
        row: recordRow,
        extra: fields.splice(width)
      });
    }

    rows.push(fields);
  }

  while (true) {
    // Skip empty lines (LF or CRLF only).
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }

    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Line extent first (bounded: the next newline is near), then a quote/CR
    // check bounded to this line's slice (no scan ever runs past the line).
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? len : nl;
    const lineStr = text.slice(pos, lineEnd);
    let lineHasQuote = lineStr.indexOf('"') !== -1;
    let segEnd = lineEnd;
    let fast = false;
    if (!lineHasQuote) {
      const cr = lineStr.indexOf('\r');
      if (cr === -1) {
        fast = true;
      } else if (cr === lineStr.length - 1 && nl !== -1) {
        segEnd = lineEnd - 1; // CRLF: the CR belongs to the break
        fast = true;
      }
      // Any other CR in the line is stray: fall through to the slow path.
    }
    if (!fast) {
      const fields = [];
      let lastFieldQuoted;
      do {
        lastFieldQuoted = text.charCodeAt(pos) === 34;
        fields.push(lastFieldQuoted ? readQuotedField() : readUnquotedInto(''));
      } while (fieldEnded === COMMA);
      if (fields.length === 1 && fields[0] === '' && !lastFieldQuoted) continue;
      finishRecord(fields);
      continue;
    }

    if (segEnd === pos) {
      // Empty line (unreachable after the skip loop, kept as a guard).
      pos = lineEnd < len ? lineEnd + 1 : len;
      if (lineEnd < len) line += 1;
      continue;
    }
    const fields = (segEnd === lineEnd ? lineStr : text.slice(pos, segEnd)).split(',');
    pos = lineEnd < len ? lineEnd + 1 : len;
    if (lineEnd < len) line += 1;
    finishRecord(fields);
  }

  return {
    columns: header ? (columns ?? []) : null,
    rows,
    errors
  };
}
