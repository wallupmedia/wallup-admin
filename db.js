// ═══════════════════════════════════════════════════════════
// WALL UP ADMIN — BASE DE DATOS EN LA NUBE
// KV primero. localStorage como fallback offline.
// ═══════════════════════════════════════════════════════════
const WU_DB = {
  KV: 'https://notion-proxy-wallup.wallupmedia.workers.dev/db',
  _online: true,
  _listeners: {},

  // ─── Leer ───
  async get(key) {
    try {
      const r = await fetch(`${this.KV}/${key}`, {cache: 'no-store'});
      if (!r.ok) throw new Error('network');
      const text = await r.text();
      const val = text === 'null' ? null : JSON.parse(text);
      // Actualiza localStorage como backup
      if (val !== null) localStorage.setItem(key, JSON.stringify(val));
      this._online = true;
      return val;
    } catch {
      this._online = false;
      // Fallback a localStorage
      const local = localStorage.getItem(key);
      return local ? JSON.parse(local) : null;
    }
  },

  // ─── Escribir ───
  async set(key, value) {
    // Siempre escribe en localStorage primero (instantáneo)
    localStorage.setItem(key, JSON.stringify(value));
    // Luego sube a KV
    try {
      const r = await fetch(`${this.KV}/${key}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(value)
      });
      if (!r.ok) throw new Error('network');
      this._online = true;
      this._emit(key, value);
      return true;
    } catch {
      this._online = false;
      // Marca como pendiente de sync
      const pending = JSON.parse(localStorage.getItem('wu_pending_sync') || '[]');
      if (!pending.includes(key)) { pending.push(key); localStorage.setItem('wu_pending_sync', JSON.stringify(pending)); }
      return false;
    }
  },

  // ─── Sincronizar pendientes (cuando vuelve la conexión) ───
  async syncPending() {
    const pending = JSON.parse(localStorage.getItem('wu_pending_sync') || '[]');
    if (!pending.length) return;
    const synced = [];
    for (const key of pending) {
      const local = localStorage.getItem(key);
      if (local) {
        try {
          const r = await fetch(`${this.KV}/${key}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:local});
          if (r.ok) synced.push(key);
        } catch {}
      }
    }
    if (synced.length) {
      const remaining = pending.filter(k => !synced.includes(k));
      localStorage.setItem('wu_pending_sync', JSON.stringify(remaining));
    }
    return synced.length;
  },

  // ─── Helpers para los datos principales ───
  async getQuotes()   { return await this.get('wu_quotes')   || []; },
  async getClients()  { return await this.get('wu_clients')  || []; },
  async getCatalog()  { return await this.get('wu_catalog')  || []; },
  async getCombos()   { return await this.get('wu_combos')   || []; },
  async getExpenses() { return await this.get('wu_expenses') || []; },
  async getComms()    { return await this.get('wu_commissions') || []; },
  async getNotion()   { return await this.get('wu_notion')   || {}; },
  async getExpCat()   { return await this.get('wu_expense_catalog') || []; },
  async getCounter()  { return await this.get('wu_counter')  || 1; },

  async saveQuotes(v)   { return await this.set('wu_quotes', v); },
  async saveClients(v)  { return await this.set('wu_clients', v); },
  async saveCatalog(v)  { return await this.set('wu_catalog', v); },
  async saveCombos(v)   { return await this.set('wu_combos', v); },
  async saveExpenses(v) { return await this.set('wu_expenses', v); },
  async saveComms(v)    { return await this.set('wu_commissions', v); },
  async saveNotion(v)   { return await this.set('wu_notion', v); },
  async saveExpCat(v)   { return await this.set('wu_expense_catalog', v); },
  async saveCounter(v)  { return await this.set('wu_counter', v); },

  // ─── Eventos (notifica cuando cambia un key) ───
  on(key, fn)  { if (!this._listeners[key]) this._listeners[key]=[]; this._listeners[key].push(fn); },
  off(key, fn) { if (this._listeners[key]) this._listeners[key]=this._listeners[key].filter(f=>f!==fn); },
  _emit(key, val) { (this._listeners[key]||[]).forEach(fn=>fn(val)); },

  // ─── Estado de conexión ───
  isOnline() { return this._online; },

  // ─── Init: carga datos frescos + sync pendientes ───
  async init(onReady) {
    // Sincroniza datos pendientes offline primero
    await this.syncPending();
    if (onReady) onReady();
  }
};

// Monitorear conexión
window.addEventListener('online',  () => { WU_DB._online=true;  WU_DB.syncPending(); });
window.addEventListener('offline', () => { WU_DB._online=false; });
