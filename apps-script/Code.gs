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
 *   Sessions(tableId, sessionId, date, location, notes, createdAt, status)
 *   Results(tableId, sessionId, playerId, net, chips)
 *   BuyIns(tableId, sessionId, playerId, buyInId, amount, remark, createdAt)
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
  Sessions: ['tableId', 'sessionId', 'date', 'location', 'notes', 'createdAt', 'status'],
  Results: ['tableId', 'sessionId', 'playerId', 'net', 'chips'],
  BuyIns: ['tableId', 'sessionId', 'playerId', 'buyInId', 'amount', 'remark', 'createdAt'],
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
  } else {
    ensureColumns(sh, name);
  }
  return sh;
}

/** Appends any SCHEMA columns missing from an existing sheet (in-place migration). */
function ensureColumns(sh, name) {
  var want = SCHEMA[name];
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < want.length; i++) {
    if (headers.indexOf(want[i]) === -1) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(want[i]);
    }
  }
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
    sessions: readAll('Sessions').map(function (s) {
      s.status = s.status === 'open' ? 'open' : 'closed';
      return s;
    }),
    results: readAll('Results').map(function (r) {
      r.net = Number(r.net) || 0;
      r.chips = r.chips === '' || r.chips == null ? null : Number(r.chips);
      return r;
    }),
    buyIns: readAll('BuyIns').map(function (b) {
      b.amount = Number(b.amount) || 0;
      return b;
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
      case 'startSession':
        return ok(startSession(body));
      case 'addBuyIn':
        return ok(addBuyIn(body));
      case 'editBuyIn':
        return ok(editBuyIn(body));
      case 'deleteBuyIn':
        return ok(deleteBuyIn(body));
      case 'closeSession':
        return ok(closeSession(body));
      case 'reopenSession':
        return ok(reopenSession(body));
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
    var chips = r.chips == null || r.chips === '' ? '' : Number(r.chips);
    return [tableId, sessionId, r.playerId, Number(r.net) || 0, chips];
  });
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
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
    'closed',
  ]);
  appendResults(body.tableId, sessionId, body.results);
  recomputeStatuses(body.tableId);
  return { sessionId: sessionId };
}

/* ---------- Live sessions with buy-ins ---------- */

function startSession(body) {
  if (!body.tableId) throw new Error('tableId is required.');
  var sessionId = uid('s');
  sheetFor('Sessions').appendRow([
    body.tableId,
    sessionId,
    body.date || nowIso().slice(0, 10),
    body.location || '',
    body.notes || '',
    nowIso(),
    'open',
  ]);
  var players = body.players || [];
  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    addBuyInRow(
      body.tableId,
      sessionId,
      p.playerId,
      p.amount == null ? 1000 : p.amount,
      p.remark || ''
    );
  }
  return { sessionId: sessionId };
}

function addBuyInRow(tableId, sessionId, playerId, amount, remark) {
  if (!playerId) throw new Error('playerId is required.');
  var amt = Number(amount);
  if (!(amt > 0)) throw new Error('Buy-in amount must be positive.');
  var buyInId = uid('b');
  sheetFor('BuyIns').appendRow([
    tableId,
    sessionId,
    playerId,
    buyInId,
    amt,
    String(remark || ''),
    nowIso(),
  ]);
  return buyInId;
}

function addBuyIn(body) {
  if (!body.tableId || !body.sessionId) {
    throw new Error('tableId and sessionId are required.');
  }
  var buyInId = addBuyInRow(
    body.tableId,
    body.sessionId,
    body.playerId,
    body.amount == null ? 1000 : body.amount,
    body.remark
  );
  return { buyInId: buyInId };
}

function editBuyIn(body) {
  var sh = sheetFor('BuyIns');
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf('buyInId');
  var amtCol = headers.indexOf('amount');
  var remCol = headers.indexOf('remark');
  for (var i = 1; i < values.length; i++) {
    if (values[i][idCol] === body.buyInId) {
      if (body.amount != null) {
        var amt = Number(body.amount);
        if (!(amt > 0)) throw new Error('Buy-in amount must be positive.');
        sh.getRange(i + 1, amtCol + 1).setValue(amt);
      }
      if (body.remark != null) {
        sh.getRange(i + 1, remCol + 1).setValue(String(body.remark));
      }
      return { ok: true };
    }
  }
  throw new Error('Buy-in not found.');
}

function deleteBuyIn(body) {
  var sh = sheetFor('BuyIns');
  var values = sh.getDataRange().getValues();
  var idCol = values[0].indexOf('buyInId');
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][idCol] === body.buyInId) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  throw new Error('Buy-in not found.');
}

function buyInTotalsFor(sessionId) {
  var rows = readAll('BuyIns').filter(function (b) {
    return b.sessionId === sessionId;
  });
  var totals = {};
  rows.forEach(function (b) {
    totals[b.playerId] = (totals[b.playerId] || 0) + (Number(b.amount) || 0);
  });
  return totals;
}

function closeSession(body) {
  if (!body.tableId || !body.sessionId) {
    throw new Error('tableId and sessionId are required.');
  }
  var chips = body.results || [];
  if (chips.length < 2) throw new Error('A session needs at least two players.');
  var totals = buyInTotalsFor(body.sessionId);
  var results = chips.map(function (c) {
    var chipCount = Number(c.chips) || 0;
    var buyIn = totals[c.playerId] || 0;
    return { playerId: c.playerId, net: chipCount - buyIn, chips: chipCount };
  });
  assertZeroSum(results);
  var sh = sheetFor('Sessions');
  var values = sh.getDataRange().getValues();
  var statusCol = values[0].indexOf('status');
  var found = false;
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === body.tableId && values[i][1] === body.sessionId) {
      if (body.date) sh.getRange(i + 1, 3).setValue(body.date);
      if (body.location != null) sh.getRange(i + 1, 4).setValue(body.location);
      if (body.notes != null) sh.getRange(i + 1, 5).setValue(body.notes);
      sh.getRange(i + 1, statusCol + 1).setValue('closed');
      found = true;
      break;
    }
  }
  if (!found) throw new Error('Session not found.');
  deleteResultsFor(body.sessionId);
  appendResults(body.tableId, body.sessionId, results);
  recomputeStatuses(body.tableId);
  return { ok: true };
}

function reopenSession(body) {
  var sh = sheetFor('Sessions');
  var values = sh.getDataRange().getValues();
  var statusCol = values[0].indexOf('status');
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === body.tableId && values[i][1] === body.sessionId) {
      sh.getRange(i + 1, statusCol + 1).setValue('open');
      deleteResultsFor(body.sessionId);
      recomputeStatuses(body.tableId);
      return { ok: true };
    }
  }
  throw new Error('Session not found.');
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

function deleteBuyInsFor(sessionId) {
  var sh = sheetFor('BuyIns');
  var values = sh.getDataRange().getValues();
  var sidCol = values[0].indexOf('sessionId');
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][sidCol] === sessionId) {
      sh.deleteRow(i + 1);
    }
  }
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
  deleteBuyInsFor(body.sessionId);
  recomputeStatuses(body.tableId);
  return { ok: true };
}
