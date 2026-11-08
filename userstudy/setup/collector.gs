/**
 * SWIM motion study: private Google Sheets response collector.
 * 1. Paste into a new project at https://script.google.com/.
 * 2. Run setupStudy once and approve Google authorization.
 * 3. Deploy > New deployment > Web app.
 *    Execute as: Me. Who has access: Anyone.
 * 4. Send the /exec deployment URL to the website maintainer.
 * The spreadsheet stays private. No answer key belongs in this project.
 */
var STUDY_VERSION = 'swim-motion-v1-20261108';
var SHEET_PROPERTY = 'SWIM_RESPONSE_SPREADSHEET';
var SHEET_NAME = 'Responses';
var SESSION_SHEET = 'Sessions';
var SESSION_HEADERS = ['participant_id', 'receipt_nonce_sha256', 'study_version', 'started_at_utc',
  'last_seen_utc', 'status', 'ranked_videos', 'current_step', 'resume_count', 'revision'];
var CLIPS = Array.from({length:16}, function(_, i) { return 'clip' + String(i + 1).padStart(2, '0'); });
var HEADERS = ['participant_id', 'receipt_nonce_sha256', 'payload_sha256', 'submitted_at_utc',
  'study_version', 'started_at_utc', 'consent', 'swimming_experience', 'technical_experience',
  'attention_answer', 'attention_passed', 'comments'].concat(CLIPS.map(function(c) { return c + '_rank_most_to_least'; }),
  ['watched_seconds_json', 'completed_plays_json', 'answers_json']);

function setupStudy() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var properties = PropertiesService.getScriptProperties();
    var id = properties.getProperty(SHEET_PROPERTY);
    var book;
    if (id) {
      book = SpreadsheetApp.openById(id);
    } else {
      book = SpreadsheetApp.create('SWIM Motion Quality Study Responses');
      properties.setProperty(SHEET_PROPERTY, book.getId());
    }
    [[SHEET_NAME, HEADERS], [SESSION_SHEET, SESSION_HEADERS]].forEach(function(spec) {
      var sheet = book.getSheetByName(spec[0]) || book.insertSheet(spec[0]);
      if (!sheet.getLastRow()) sheet.getRange(1, 1, 1, spec[1].length).setValues([spec[1]]);
      sheet.setFrozenRows(1);
    });
    SpreadsheetApp.flush();
    Logger.log('Private responses: ' + book.getUrl());
    Logger.log('Next: deploy a Web app. Execute as Me; access Anyone. Keep this spreadsheet private.');
  } finally {
    lock.releaseLock();
  }
}

function responseSheet_(name) {
  var id = PropertiesService.getScriptProperties().getProperty(SHEET_PROPERTY);
  if (!id) throw new Error('not_configured');
  var sheet = SpreadsheetApp.openById(id).getSheetByName(name || SHEET_NAME);
  if (!sheet || !sheet.getLastRow()) throw new Error('not_configured');
  return sheet;
}

function uuid_(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function(byte) { return ((byte + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}

function validatePayload_(p) {
  function require_(condition) { if (!condition) throw new Error('invalid_submission'); }
  require_(p && typeof p === 'object' && !Array.isArray(p));
  require_(p.version === STUDY_VERSION && uuid_(p.id) && uuid_(p.nonce) && p.consent === true);
  require_(typeof p.startedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.startedAt) && Number.isFinite(Date.parse(p.startedAt)));
  require_(['none', 'recreational', 'experienced'].indexOf(p.swimming) !== -1);
  require_(['none', 'some', 'professional'].indexOf(p.technical) !== -1);
  require_(['A', 'B', 'C'].indexOf(p.attention) !== -1);
  require_(typeof p.comments === 'string' && p.comments.length <= 2000);
  require_(Array.isArray(p.answers) && p.answers.length === CLIPS.length);
  p.answers.forEach(function(a, i) {
    require_(a && a.clip === CLIPS[i]);
    require_(Array.isArray(a.rank) && a.rank.length === 3 && a.rank.every(function(r) { return ['A','B','C'].indexOf(r) !== -1; }) && a.rank.slice().sort().join('') === 'ABC');
    require_(typeof a.watchedSeconds === 'number' && Number.isFinite(a.watchedSeconds) && a.watchedSeconds >= 0 && a.watchedSeconds <= 3600);
    require_(Number.isInteger(a.completedPlays) && a.completedPlays >= 0 && a.completedPlays <= 10000);
  });
  return p;
}

function findSubmission_(sheet, id) {
  var row = findRow_(sheet, id);
  return row ? sheet.getRange(row, 1, 1, 4).getDisplayValues()[0] : null;
}

function findRow_(sheet, id) {
  if (sheet.getLastRow() < 2) return 0;
  var match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return match ? match.getRow() : 0;
}

function validateProgress_(p) {
  if (!(p.version === STUDY_VERSION && uuid_(p.id) && uuid_(p.nonce) && p.consent === true &&
    typeof p.startedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.startedAt) && Number.isFinite(Date.parse(p.startedAt)) &&
    ['active','paused'].indexOf(p.status) !== -1 && CLIPS.concat(['attention','review']).indexOf(p.step) !== -1 &&
    Number.isInteger(p.ranked) && p.ranked >= 0 && p.ranked <= 16 &&
    Number.isInteger(p.resumeCount) && p.resumeCount >= 0 && p.resumeCount <= 100000 &&
    Number.isSafeInteger(p.revision) && p.revision >= 0)) throw new Error('invalid_submission');
}

// Called only under the script lock. No rankings or background answers are sent here.
function updateSession_(p, submitted) {
  var sheet = responseSheet_(SESSION_SHEET), rowNumber = findRow_(sheet, p.id);
  var old = rowNumber ? sheet.getRange(rowNumber, 1, 1, SESSION_HEADERS.length).getDisplayValues()[0] : null;
  var nonceHash = sha256_(p.nonce);
  if (old && old[1] !== nonceHash) throw new Error('submission_conflict');
  if (!submitted && old && (old[5] === 'submitted' || Number(old[9]) >= p.revision)) return;
  var row = [p.id, nonceHash, p.version, old ? old[3] : p.startedAt, new Date().toISOString(),
    submitted ? 'submitted' : p.status, submitted ? '16' : String(p.ranked), submitted ? 'review' : p.step,
    submitted ? (old ? old[8] : '0') : String(p.resumeCount),
    submitted ? (old ? old[9] : '0') : String(p.revision)];
  sheet.getRange(rowNumber || sheet.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
}

function verifySessionOwner_(p) {
  var sheet = responseSheet_(SESSION_SHEET), row = findRow_(sheet, p.id);
  if (row && sheet.getRange(row, 2, 1, 1).getDisplayValues()[0][0] !== sha256_(p.nonce)) throw new Error('submission_conflict');
}

function receipt_(row) {
  return {accepted:true, id:row[0], payloadHash:row[2], submittedAt:row[3]};
}

function safeCell_(value) {
  return /^[\s\uFEFF]*[=+\-@]/.test(value) ? "'" + value : value;
}

function output_(value, callback) {
  var json = JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  if (callback) {
    if (!/^swim_[a-f0-9]{32}$/.test(callback)) {
      return ContentService.createTextOutput('{"error":"invalid_callback"}').setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock(), locked = false;
  try {
    var body = e && e.postData && e.postData.contents;
    if (typeof body !== 'string' || body.length > 40000) throw new Error('invalid_submission');
    var p = JSON.parse(body);
    if (p && p.kind === 'progress') {
      validateProgress_(p);
      lock.waitLock(30000); locked = true;
      var accepted = findSubmission_(responseSheet_(), p.id);
      if (accepted && accepted[1] !== sha256_(p.nonce)) throw new Error('submission_conflict');
      updateSession_(p, Boolean(accepted));
      SpreadsheetApp.flush();
      return output_({recorded:true});
    }
    validatePayload_(p);
    var nonceHash = sha256_(p.nonce), payloadHash = sha256_(body);
    lock.waitLock(30000); locked = true;
    var sheet = responseSheet_(), existing = findSubmission_(sheet, p.id);
    verifySessionOwner_(p);
    if (existing) {
      if (existing[1] !== nonceHash || existing[2] !== payloadHash) throw new Error('submission_conflict');
      updateSession_(p, true);
      SpreadsheetApp.flush();
      return output_(receipt_(existing));
    }
    var timestamp = new Date().toISOString();
    // Record the attention answer without filtering out participants.
    var row = [p.id, nonceHash, payloadHash, timestamp, p.version, p.startedAt, 'true',
      p.swimming, p.technical, p.attention, String(p.attention === 'B'), safeCell_(p.comments)]
      .concat(p.answers.map(function(a) { return a.rank.join('>'); }),
      [JSON.stringify(p.answers.map(function(a) { return a.watchedSeconds; })),
       JSON.stringify(p.answers.map(function(a) { return a.completedPlays; })),
       JSON.stringify(p.answers.map(function(a) { return {clip:a.clip, rank:a.rank, watchedSeconds:a.watchedSeconds, completedPlays:a.completedPlays}; }))]);
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
    updateSession_(p, true);
    SpreadsheetApp.flush();
    return output_(receipt_(row));
  } catch (error) {
    var allowed = ['invalid_submission', 'submission_conflict', 'not_configured'];
    return output_({accepted:false, error:allowed.indexOf(error.message) >= 0 ? error.message : 'temporarily_unavailable'});
  } finally {
    if (locked) lock.releaseLock();
  }
}

function doGet(e) {
  var q = e && e.parameter || {}, result;
  try {
    if (q.action === 'health') {
      responseSheet_();
      responseSheet_(SESSION_SHEET);
      result = {ready:true, version:STUDY_VERSION, protocol:2};
    } else if (q.action === 'receipt') {
      if (!uuid_(q.id) || !uuid_(q.nonce)) throw new Error('invalid_request');
      var row = findSubmission_(responseSheet_(), q.id);
      result = row && row[1] === sha256_(q.nonce) ? receipt_(row) : {accepted:false};
    } else {
      result = {ready:false, error:'invalid_action'};
    }
  } catch (error) {
    result = {ready:false, accepted:false, error:'unavailable'};
  }
  return output_(result, q.callback);
}
