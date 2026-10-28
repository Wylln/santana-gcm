/**
 * Camada de Persistência Local — Meu Edital GCM Santana 2026
 *
 * Utiliza IndexedDB como armazenamento principal confiável (com espelhamento
 * automático em localStorage como fallback síncrono), garantindo:
 * - Salvamento imediato de cada marcação/desmarcação
 * - Persistência após fechar, atualizar ou reabrir o aplicativo
 * - Preservação integral das marcações após atualizações do PWA
 * - Armazenamento local também do conteúdo integral do edital para acesso offline
 */

const DB_CONFIG = {
  name: "MeuEditalGCMSantana2026DB",
  version: 1,
  stores: {
    progress: "progresso_topicos",
    edital: "conteudo_edital",
    meta: "metadados_estudo"
  },
  localStorageKey: "gcm_santana_2026_progresso_v1",
  localStorageMetaKey: "gcm_santana_2026_meta_v1"
};

class EditalStorage {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  /**
   * Inicializa a conexão com o IndexedDB e sincroniza com o fallback local
   */
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(false);
        return;
      }

      try {
        const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          if (!db.objectStoreNames.contains(DB_CONFIG.stores.progress)) {
            db.createObjectStore(DB_CONFIG.stores.progress, { keyPath: "topicId" });
          }

          if (!db.objectStoreNames.contains(DB_CONFIG.stores.edital)) {
            db.createObjectStore(DB_CONFIG.stores.edital, { keyPath: "id" });
          }

          if (!db.objectStoreNames.contains(DB_CONFIG.stores.meta)) {
            db.createObjectStore(DB_CONFIG.stores.meta, { keyPath: "key" });
          }
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          resolve(true);
        };

        request.onerror = () => {
          console.warn("IndexedDB indisponível; utilizando armazenamento local de contingência.");
          resolve(false);
        };
      } catch (err) {
        console.warn("Erro ao abrir IndexedDB:", err);
        resolve(false);
      }
    });

    return this.initPromise;
  }

  /**
   * Salva o conteúdo integral do edital no IndexedDB para garantir
   * disponibilidade offline independente de servidor externo, preservando marcações.
   */
  async cacheEditalContent(editalData) {
    await this.init();
    if (!this.db || !editalData) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([DB_CONFIG.stores.edital], "readwrite");
        const store = tx.objectStore(DB_CONFIG.stores.edital);
        store.put({
          id: "edital_gcm_santana_2026",
          version: editalData.version,
          updatedAt: new Date().toISOString(),
          data: editalData
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Recupera todas as marcações salvas (união segura entre IndexedDB e localStorage
   * para nunca perder progresso em caso de atualização)
   * @returns {Promise<Record<string, { checked: boolean, updatedAt: string }>>}
   */
  async getAllProgress() {
    await this.init();

    const localMap = this._readLocalStorage();

    if (!this.db) {
      return localMap;
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([DB_CONFIG.stores.progress], "readonly");
        const store = tx.objectStore(DB_CONFIG.stores.progress);
        const req = store.getAll();

        req.onsuccess = () => {
          const rows = req.result || [];
          const idbMap = {};
          for (const row of rows) {
            if (row && row.topicId && row.checked) {
              idbMap[row.topicId] = {
                checked: Boolean(row.checked),
                updatedAt: row.updatedAt || null
              };
            }
          }

          // Se houver itens no localStorage que ainda não estavam no IndexedDB, sincroniza
          const merged = { ...localMap, ...idbMap };
          this._writeLocalStorage(merged);
          resolve(merged);
        };

        req.onerror = () => {
          resolve(localMap);
        };
      } catch {
        resolve(localMap);
      }
    });
  }

  /**
   * Marca ou desmarca um subtópico e salva imediatamente no IndexedDB e localStorage
   * @param {string} topicId Ex: "1.1", "5.5", "10.8"
   * @param {boolean} checked
   */
  async setTopicChecked(topicId, checked) {
    const timestamp = new Date().toISOString();
    const currentLocal = this._readLocalStorage();

    if (checked) {
      currentLocal[topicId] = {
        checked: true,
        updatedAt: timestamp
      };
    } else {
      delete currentLocal[topicId];
    }

    this._writeLocalStorage(currentLocal);

    await this.init();
    if (!this.db) {
      return true;
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([DB_CONFIG.stores.progress], "readwrite");
        const store = tx.objectStore(DB_CONFIG.stores.progress);

        if (checked) {
          store.put({
            topicId,
            checked: true,
            updatedAt: timestamp
          });
        } else {
          store.delete(topicId);
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Limpa todo o progresso de estudos (chamado apenas após confirmação explícita do usuário)
   */
  async clearAllProgress() {
    this._writeLocalStorage({});

    await this.init();
    if (!this.db) {
      return true;
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([DB_CONFIG.stores.progress], "readwrite");
        const store = tx.objectStore(DB_CONFIG.stores.progress);
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  _readLocalStorage() {
    try {
      const raw = localStorage.getItem(DB_CONFIG.localStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  _writeLocalStorage(map) {
    try {
      localStorage.setItem(DB_CONFIG.localStorageKey, JSON.stringify(map));
    } catch {
      // Ignora erro de quota
    }
  }
}

const editalStorage = new EditalStorage();
if (typeof window !== "undefined") {
  window.editalStorage = editalStorage;
}
