// ═══════════════════════════════════════════════════════
// CLOUD — Google login + Firestore sync for Road Register
// Bundled by esbuild into www/js/cloud.js (npm run build)
// ═══════════════════════════════════════════════════════
import { initializeApp } from 'firebase/app';
import {
  getAuth, initializeAuth, indexedDBLocalPersistence,
  GoogleAuthProvider, signInWithPopup, signInWithCredential,
  onAuthStateChanged, signOut as fbSignOut,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDocs, getDoc, onSnapshot, writeBatch, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

const COLS = ['works', 'mat', 'exp'];           // one Firestore doc per record
const OWNER_KEY = 'rca_owner';                    // which uid the localStorage data belongs to
const isNative = Capacitor.isNativePlatform();

let app, auth, db, uid = null;
let last = null;           // last state known to be in Firestore: {works:Map, mat:Map, exp:Map, lists:string|null}
let unsubs = [];
let ready = false;         // initial merge done
let pending = 0;

function status(s) { window.RR && RR.setSyncStatus(s); }

// ── helpers ─────────────────────────────────────────────
function localSnapshot() {
  const s = RR.getState();
  const out = { lists: JSON.stringify({ drivers: s.drivers, vehicles: s.vehicles }) };
  COLS.forEach(c => {
    const m = new Map();
    (s[c] || []).forEach(r => { if (r && r.id != null) m.set(String(r.id), JSON.stringify(r)); });
    out[c] = m;
  });
  return out;
}
const byId = (a, b) => {
  const na = Number(String(a.id).replace(/\D/g, '')), nb = Number(String(b.id).replace(/\D/g, ''));
  return na - nb;
};
const userRef = () => doc(db, 'users', uid);
const listsRef = () => doc(db, 'users', uid, 'meta', 'lists');

// ── push local changes (diff) ──────────────────────────
function push() {
  if (!uid || !ready || !last) return;
  const cur = localSnapshot();
  const ops = [];
  COLS.forEach(c => {
    cur[c].forEach((json, id) => { if (last[c].get(id) !== json) ops.push(['set', doc(db, 'users', uid, c, id), JSON.parse(json)]); });
    last[c].forEach((_, id) => { if (!cur[c].has(id)) ops.push(['del', doc(db, 'users', uid, c, id)]); });
  });
  if (cur.lists !== last.lists) ops.push(['set', listsRef(), JSON.parse(cur.lists)]);
  last = cur;
  if (!ops.length) return;

  // Firestore batch limit = 500 ops
  for (let i = 0; i < ops.length; i += 450) {
    const b = writeBatch(db);
    ops.slice(i, i + 450).forEach(([t, ref, data]) => t === 'set' ? b.set(ref, data) : b.delete(ref));
    pending++;
    status(navigator.onLine ? 'syncing' : 'offline');
    b.commit()
      .then(() => { pending--; if (!pending) status('synced'); })
      .catch(e => { pending--; status('error'); RR.toast('Cloud save error: ' + e.code); console.error(e); });
  }
}

// ── first load after login: merge cloud + local ────────
async function initialMerge() {
  const owner = localStorage.getItem(OWNER_KEY);
  const local = RR.getState();
  const keepLocal = !owner || owner === uid;  // never mix data of another account

  const cloud = {};
  for (const c of COLS) {
    const snap = await getDocs(collection(db, 'users', uid, c));
    cloud[c] = snap.docs.map(d => d.data());
  }
  const ls = await getDoc(listsRef());
  const cloudLists = ls.exists() ? ls.data() : null;

  // last = what is actually in cloud now
  last = { lists: cloudLists ? JSON.stringify({ drivers: cloudLists.drivers, vehicles: cloudLists.vehicles }) : null };
  COLS.forEach(c => { last[c] = new Map(cloud[c].map(r => [String(r.id), JSON.stringify(r)])); });

  // merged = cloud ∪ local (cloud wins on same id)
  const merged = {};
  COLS.forEach(c => {
    const m = new Map();
    if (keepLocal) (local[c] || []).forEach(r => r && r.id != null && m.set(String(r.id), r));
    cloud[c].forEach(r => m.set(String(r.id), r));
    merged[c] = [...m.values()].sort(byId);
  });
  const uniq = a => [...new Set(a)];
  if (cloudLists && keepLocal) {
    merged.drivers = uniq([...(cloudLists.drivers || []), ...local.drivers]);
    merged.vehicles = uniq([...(cloudLists.vehicles || []), ...local.vehicles]);
  } else if (cloudLists) {
    merged.drivers = cloudLists.drivers || [];
    merged.vehicles = cloudLists.vehicles || [];
  } else {
    merged.drivers = local.drivers; merged.vehicles = local.vehicles; // defaults / local
  }

  RR.setState(merged);
  localStorage.setItem(OWNER_KEY, uid);
  ready = true;
  push();               // uploads anything that was only local
  RR.refresh();
}

// ── live updates from other devices ────────────────────
function listen() {
  COLS.forEach(c => {
    unsubs.push(onSnapshot(collection(db, 'users', uid, c), snap => {
      if (!ready) return;
      const rows = snap.docs.map(d => d.data()).sort(byId);
      last[c] = new Map(rows.map(r => [String(r.id), JSON.stringify(r)]));
      const cur = localSnapshot()[c];
      const same = cur.size === last[c].size && [...cur].every(([k, v]) => last[c].get(k) === v);
      if (same) return;
      RR.setState({ [c]: rows });
      RR.refresh();
    }, e => console.warn('listen', c, e)));
  });
  unsubs.push(onSnapshot(listsRef(), snap => {
    if (!ready || !snap.exists()) return;
    const d = snap.data();
    const json = JSON.stringify({ drivers: d.drivers, vehicles: d.vehicles });
    last.lists = json;
    if (json === localSnapshot().lists) return;
    RR.setState({ drivers: d.drivers || [], vehicles: d.vehicles || [] });
    RR.refresh();
  }));
}

// ── auth ───────────────────────────────────────────────
async function signIn() {
  try {
    RR.setLoginBusy(true);
    if (isNative) {
      const res = await FirebaseAuthentication.signInWithGoogle();
      const idToken = res && res.credential && res.credential.idToken;
      if (!idToken) throw new Error('Google se token nahi mila');
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    } else {
      await signInWithPopup(auth, new GoogleAuthProvider());
    }
  } catch (e) {
    console.error(e);
    RR.setLoginBusy(false);
    RR.loginError((e && (e.code || e.message)) || 'Login failed');
  }
}

async function signOut() {
  if (!confirm('Logout karna hai? Data cloud me safe rahega.')) return;
  try { if (isNative) await FirebaseAuthentication.signOut(); } catch (e) { /* ignore */ }
  await fbSignOut(auth);
  RR.clearLocal();
  location.reload();
}

async function onLogin(user) {
  uid = user.uid;
  RR.showApp(user);
  status('syncing');
  setDoc(userRef(), {
    email: user.email || '', name: user.displayName || '', photo: user.photoURL || '',
    lastLogin: serverTimestamp(), platform: isNative ? 'android' : 'web',
  }, { merge: true }).catch(() => {});
  try {
    await initialMerge();
    listen();
    if (!pending) status(navigator.onLine ? 'synced' : 'offline');
  } catch (e) {
    console.error(e);
    status('error');
    RR.toast('Cloud load error: ' + (e.code || e.message));
  }
}

function start() {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey || cfg.apiKey.startsWith('PASTE')) {
    RR.loginError('firebase-config.js me apna Firebase config paste karo');
    return;
  }
  app = initializeApp(cfg);
  auth = isNative ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

  onAuthStateChanged(auth, user => {
    if (user) { if (user.uid !== uid) onLogin(user); }
    else { uid = null; RR.showLogin(); }
  });
  window.addEventListener('online', () => { if (uid && !pending) status('synced'); });
  window.addEventListener('offline', () => { if (uid) status('offline'); });
}

window.Cloud = { start, signIn, signOut, push };
start();
