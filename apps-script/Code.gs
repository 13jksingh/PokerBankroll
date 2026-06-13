/**
 * PokerBankroll — Google Apps Script backend.
 *
 * One web app that reads/writes a single Google Sheet acting as the database.
 * Deploy as: Execute as = Me, Who has access = Anyone.
 * No end-user login required (open view + edit for the group).
 *
 * Tabs (created automatically on first run):
 *   Tables(tableId, name, createdAt)
 *   Players(tableId, playerId, name, status, createdAt)
 *   Sessions(tableId, sessionId, date, location, notes, createdAt)
 *   Results(tableId, sessionId, playerId, net)
 */

var EPSILON = 0.01;
var MEMBER_THRESHOLD = 5;

/**
 * Run once from the Apps Script editor to set the editing PIN, e.g.
 *   setEditPin('1234')
 * Stored in Script Properties so it never lives in source control.
 */
function setEditPin(newPin) {
  var pin = String(newPin == null ? '' : newPin);
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits.');
  }
  PropertiesService.getScriptProperties().setProperty('EDIT_PIN', pin);
  return 'PIN updated.';
}

/** Throws unless body.pin matches the configured editing PIN. */
function assertPin(body) {
  var expected = PropertiesService.getScriptProperties().getProperty('EDIT_PIN');
  if (!expected) {
    throw new Error('Editing PIN is not configured. Run setEditPin() once.');
  }
  if (String(body && body.pin) !== String(expected)) {
    throw new Error('Incorrect PIN.');
  }
}

var SCHEMA = {
  Tables: ['tableId', 'name', 'createdAt'],
  Players: ['tableId', 'playerId', 'name', 'status', 'createdAt'],
  Sessions: ['tableId', 'sessionId', 'date', 'location', 'notes', 'createdAt'],
  Results: ['tableId', 'sessionId', 'playerId', 'net'],
};

function ok(data) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, data: data })
  ).setMimeType(ContentService.MimeType.JSON);
}

function fail(message) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: false, error: String(message) })
  ).setMimeType(ContentService.MimeType.JSON);
}

function sheetFor(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SCHEMA[name]);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(SCHEMA[name]);
  }
  return sh;
}

function readAll(name) {
  var sh = sheetFor(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) {
      row[headers[c]] = values[i][c];
    }
    rows.push(row);
  }
  return rows;
}

function uid(prefix) {
  return (
    prefix +
    '_' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7)
  );
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeBootstrap() {
  return {
    tables: readAll('Tables'),
    players: readAll('Players'),
    sessions: readAll('Sessions'),
    results: readAll('Results').map(function (r) {
      r.net = Number(r.net) || 0;
      return r;
    }),
  };
}

/* ---------- HTTP entry points ---------- */

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'bootstrap';
    if (action === 'bootstrap' || action === 'tables') {
      return ok(normalizeBootstrap());
    }
    return fail('Unknown action: ' + action);
  } catch (err) {
    return fail(err.message || err);
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    assertPin(body);
    switch (action) {
      case 'verifyPin':
        return ok({ ok: true });
      case 'createTable':
        return ok(createTable(body));
      case 'addPlayer':
        return ok(addPlayer(body));
      case 'renamePlayer':
        return ok(renamePlayer(body));
      case 'addSession':
        return ok(addSession(body));
      case 'editSession':
        return ok(editSession(body));
      case 'deleteSession':
        return ok(deleteSession(body));
      default:
        return fail('Unknown action: ' + action);
    }
  } catch (err) {
    return fail(err.message || err);
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Mutations ---------- */

function createTable(body) {
  if (!body.name) throw new Error('Table name is required.');
  var sh = sheetFor('Tables');
  var tableId = uid('t');
  sh.appendRow([tableId, String(body.name), nowIso()]);
  return { tableId: tableId };
}

function addPlayer(body) {
  if (!body.tableId) throw new Error('tableId is required.');
  if (!body.name) throw new Error('Player name is required.');
  var sh = sheetFor('Players');
  var playerId = uid('p');
  sh.appendRow([body.tableId, playerId, String(body.name), 'guest', nowIso()]);
  return { playerId: playerId };
}

function renamePlayer(body) {
  var sh = sheetFor('Players');
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === body.tableId && values[i][1] === body.playerId) {
      sh.getRange(i + 1, 3).setValue(String(body.name));
      return { ok: true };
    }
  }
  throw new Error('Player not found.');
}

function assertZeroSum(results) {
  if (!results || results.length < 2) {
    throw new Error('A session needs at least two players.');
  }
  var sum = 0;
  for (var i = 0; i < results.length; i++) {
    sum += Number(results[i].net) || 0;
  }
  if (Math.abs(sum) > EPSILON) {
    throw new Error('Results must balance to zero (off by ' + sum.toFixed(2) + ').');
  }
}

function appendResults(tableId, sessionId, results) {
  var sh = sheetFor('Results');
  var rows = results.map(function (r) {
    return [tableId, sessionId, r.playerId, Number(r.net) || 0];
  });
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  }
}

function recomputeStatuses(tableId) {
  var results = readAll('Results').filter(function (r) {
    return r.tableId === tableId;
  });
  var sessionsByPlayer = {};
  results.forEach(function (r) {
    if (!sessionsByPlayer[r.playerId]) sessionsByPlayer[r.playerId] = {};
    sessionsByPlayer[r.playerId][r.sessionId] = true;
  });

  var sh = sheetFor('Players');
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] !== tableId) continue;
    var pid = values[i][1];
    var games = sessionsByPlayer[pid]
      ? Object.keys(sessionsByPlayer[pid]).length
      : 0;
    var status = games >= MEMBER_THRESHOLD ? 'member' : 'guest';
    if (values[i][3] !== status) {
      sh.getRange(i + 1, 4).setValue(status);
    }
  }
}

function addSession(body) {
  if (!body.tableId) throw new Error('tableId is required.');
  assertZeroSum(body.results);
  var sessionId = uid('s');
  sheetFor('Sessions').appendRow([
    body.tableId,
    sessionId,
    body.date || nowIso().slice(0, 10),
    body.location || '',
    body.notes || '',
    nowIso(),
  ]);
  appendResults(body.tableId, sessionId, body.results);
  recomputeStatuses(body.tableId);
  return { sessionId: sessionId };
}

function deleteResultsFor(sessionId) {
  var sh = sheetFor('Results');
  var values = sh.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][1] === sessionId) {
      sh.deleteRow(i + 1);
    }
  }
}

function editSession(body) {
  assertZeroSum(body.results);
  var sh = sheetFor('Sessions');
  var values = sh.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === body.tableId && values[i][1] === body.sessionId) {
      sh.getRange(i + 1, 3).setValue(body.date);
      sh.getRange(i + 1, 4).setValue(body.location || '');
      sh.getRange(i + 1, 5).setValue(body.notes || '');
      found = true;
      break;
    }
  }
  if (!found) throw new Error('Session not found.');
  deleteResultsFor(body.sessionId);
  appendResults(body.tableId, body.sessionId, body.results);
  recomputeStatuses(body.tableId);
  return { ok: true };
}

function deleteSession(body) {
  var sh = sheetFor('Sessions');
  var values = sh.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][0] === body.tableId && values[i][1] === body.sessionId) {
      sh.deleteRow(i + 1);
    }
  }
  deleteResultsFor(body.sessionId);
  recomputeStatuses(body.tableId);
  return { ok: true };
}
