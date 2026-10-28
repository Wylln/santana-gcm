/**
 * Lógica Principal da Aplicação — Meu Edital GCM Santana 2026
 *
 * Gerencia renderização integral do edital, checklist interativo,
 * cálculo dinâmico de progresso geral e por disciplina, busca,
 * filtros de tópicos pendentes, persistência offline e instalação PWA.
 */

(function () {
  "use strict";

  const state = {
    progressMap: {}, // { [topicId]: { checked: true, updatedAt: string } }
    currentFilter: "all", // "all" | "pending" | "completed" | "laws"
    selectedDisciplineId: null, // null = todas visíveis
    searchQuery: "",
    collapsedDisciplines: new Set(),
    deferredInstallPrompt: null
  };

  // Referências de elementos do DOM
  const dom = {};

  function cacheDomReferences() {
    dom.overallProgressCircle = document.getElementById("overall-progress-circle");
    dom.overallPercentageRing = document.getElementById("overall-percentage-ring");
    dom.overallPercentageText = document.getElementById("overall-percentage-text");
    dom.overallStatusPill = document.getElementById("overall-status-pill");
    dom.overallFractionLabel = document.getElementById("overall-fraction-label");
    dom.overallProgressBar = document.getElementById("overall-progress-bar");
    dom.overallProgressbarWrap = document.getElementById("overall-progressbar");

    dom.statTotalCount = document.getElementById("stat-total-count");
    dom.statCompletedCount = document.getElementById("stat-completed-count");
    dom.statPendingCount = document.getElementById("stat-pending-count");

    dom.btnQuickPending = document.getElementById("btn-quick-pending");
    dom.btnQuickPendingText = document.getElementById("btn-quick-pending-text");
    dom.btnNextPending = document.getElementById("btn-next-pending");
    dom.btnClearProgress = document.getElementById("btn-clear-progress");

    dom.disciplinesOverviewGrid = document.getElementById("disciplines-overview-grid");
    dom.btnShowAllDisciplines = document.getElementById("btn-show-all-disciplines");

    dom.searchInput = document.getElementById("search-input");
    dom.btnClearSearch = document.getElementById("btn-clear-search");
    dom.filterPills = document.querySelectorAll(".filter-pill");
    dom.badgeFilterAll = document.getElementById("badge-filter-all");
    dom.badgeFilterPending = document.getElementById("badge-filter-pending");
    dom.badgeFilterCompleted = document.getElementById("badge-filter-completed");
    dom.badgeFilterLaws = document.getElementById("badge-filter-laws");

    dom.btnExpandAll = document.getElementById("btn-expand-all");
    dom.btnCollapseAll = document.getElementById("btn-collapse-all");

    dom.activeFilterBanner = document.getElementById("active-filter-banner");
    dom.activeFilterText = document.getElementById("active-filter-text");
    dom.btnResetFilters = document.getElementById("btn-reset-filters");

    dom.editalDisciplinesContainer = document.getElementById("edital-disciplines-container");
    dom.emptySearchState = document.getElementById("empty-search-state");
    dom.btnEmptyReset = document.getElementById("btn-empty-reset");

    dom.modalClearConfirm = document.getElementById("modal-clear-confirm");
    dom.modalCompletedCount = document.getElementById("modal-completed-count");
    dom.btnCancelClear = document.getElementById("btn-cancel-clear");
    dom.btnConfirmClear = document.getElementById("btn-confirm-clear");

    dom.pwaInstallBanner = document.getElementById("pwa-install-banner");
    dom.btnPwaInstallBanner = document.getElementById("btn-pwa-install-banner");
    dom.btnPwaDismissBanner = document.getElementById("btn-pwa-dismiss-banner");
    dom.btnInstallHeader = document.getElementById("btn-install-header");
    dom.modalInstallHelp = document.getElementById("modal-install-help");
    dom.btnCloseInstallHelp = document.getElementById("btn-close-install-help");

    dom.btnThemeToggle = document.getElementById("btn-theme-toggle");
    dom.connectionStatus = document.getElementById("connection-status");
    dom.connectionStatusText = document.getElementById("connection-status-text");
    dom.toastNotification = document.getElementById("toast-notification");
  }

  /**
   * Calcula porcentagem segura sem declarar 100% se houver itens pendentes
   * e sem declarar 0% se já houver ao menos 1 item concluído.
   */
  function calculateSafePercentage(completed, total) {
    if (total <= 0 || completed <= 0) return 0;
    if (completed >= total) return 100;
    const raw = Math.round((completed / total) * 100);
    if (raw === 0) return 1;
    if (raw === 100) return 99;
    return raw;
  }

  /**
   * Normaliza texto para busca insensível a acentos e caixa
   */
  function normalizeForSearch(str) {
    if (!str) return "";
    return str
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  /**
   * Escapa caracteres especiais HTML
   */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Verifica se um subtópico está marcado como estudado
   */
  function isTopicChecked(topicId) {
    return Boolean(state.progressMap[topicId] && state.progressMap[topicId].checked);
  }

  /**
   * Calcula estatísticas globais e por disciplina a partir das caixas efetivamente marcadas
   */
  function computeStats() {
    let totalTopics = 0;
    let completedTopics = 0;
    let topicsWithLaws = 0;
    const disciplineStats = {};

    for (const disc of EDITAL_DATA.disciplines) {
      const discTotal = disc.topics.length;
      let discCompleted = 0;

      for (const topic of disc.topics) {
        totalTopics += 1;
        if (topic.links && topic.links.length > 0) {
          topicsWithLaws += 1;
        }
        if (isTopicChecked(topic.id)) {
          completedTopics += 1;
          discCompleted += 1;
        }
      }

      const discPending = discTotal - discCompleted;
      const discPercent = calculateSafePercentage(discCompleted, discTotal);
      const isComplete = discTotal > 0 && discCompleted === discTotal && discPending === 0;

      disciplineStats[disc.id] = {
        total: discTotal,
        completed: discCompleted,
        pending: discPending,
        percent: discPercent,
        isComplete
      };
    }

    const pendingTopics = totalTopics - completedTopics;
    const overallPercent = calculateSafePercentage(completedTopics, totalTopics);

    return {
      totalTopics,
      completedTopics,
      pendingTopics,
      topicsWithLaws,
      overallPercent,
      disciplineStats
    };
  }

  /**
   * Renderiza os cartões superiores das 10 disciplinas na tela inicial
   */
  function renderDisciplinesOverview(stats) {
    const fragment = document.createDocumentFragment();

    for (const disc of EDITAL_DATA.disciplines) {
      const dStat = stats.disciplineStats[disc.id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `discipline-mini-card${dStat.isComplete ? " is-complete" : ""}`;
      btn.setAttribute("role", "listitem");
      btn.setAttribute("data-disc-overview-id", disc.id);
      btn.title = `Ir para ${disc.fullTitle}`;

      btn.innerHTML = `
        <div class="discipline-mini-top">
          <span class="discipline-mini-num">${escapeHtml(disc.code)}</span>
          <span class="discipline-mini-percent" data-mini-percent="${disc.id}">${dStat.percent}%</span>
        </div>
        <h3 class="discipline-mini-title">${escapeHtml(disc.fullTitle)}</h3>
        <div class="discipline-mini-footer">
          <div class="progress-track" aria-hidden="true">
            <div class="progress-fill" data-mini-bar="${disc.id}" style="width: ${dStat.percent}%"></div>
          </div>
          <div class="discipline-mini-counts">
            <span data-mini-completed="${disc.id}">${dStat.completed}/${dStat.total} estudados</span>
            <span data-mini-pending="${disc.id}">${dStat.pending === 0 ? "Concluída" : `${dStat.pending} pendente(s)`}</span>
          </div>
        </div>
      `;

      btn.addEventListener("click", () => {
        navigateToDiscipline(disc.id);
      });

      fragment.appendChild(btn);
    }

    dom.disciplinesOverviewGrid.innerHTML = "";
    dom.disciplinesOverviewGrid.appendChild(fragment);
  }

  /**
   * Renderiza integralmente as 10 disciplinas e seus 88 subtópicos no DOM
   */
  function renderFullEditalChecklist(stats) {
    const fragment = document.createDocumentFragment();

    for (const disc of EDITAL_DATA.disciplines) {
      const dStat = stats.disciplineStats[disc.id];
      const section = document.createElement("article");
      section.className = `discipline-block${dStat.isComplete ? " discipline-completed" : ""}`;
      section.id = `section-${disc.id}`;
      section.setAttribute("data-discipline-id", disc.id);

      const statusText = getDisciplineStatusText(dStat);
      const statusClass = getDisciplineStatusClass(dStat);

      // Cabeçalho da Disciplina
      const headerBtn = document.createElement("button");
      headerBtn.type = "button";
      headerBtn.className = "discipline-header";
      headerBtn.setAttribute("aria-expanded", "true");
      headerBtn.setAttribute("aria-controls", `topics-list-${disc.id}`);

      headerBtn.innerHTML = `
        <div class="discipline-header-top">
          <div class="discipline-title-wrap">
            <h3 class="discipline-heading">${escapeHtml(disc.fullTitle)}</h3>
            <span class="discipline-status-badge ${statusClass}" data-disc-status="${disc.id}">${statusText}</span>
          </div>
          <div class="discipline-toggle-meta">
            <span class="discipline-progress-label" data-disc-counts="${disc.id}">
              ${dStat.completed} de ${dStat.total} concluídos (${dStat.pending} pendentes)
            </span>
            <svg class="chevron-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
          </div>
        </div>
        <div class="discipline-progress-row">
          <div class="progress-track" role="progressbar" aria-label="Progresso em ${escapeHtml(disc.fullTitle)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${dStat.percent}" data-disc-progressbar="${disc.id}">
            <div class="progress-fill" data-disc-bar="${disc.id}" style="width: ${dStat.percent}%"></div>
          </div>
          <span class="discipline-percent-badge" data-disc-percent="${disc.id}">${dStat.percent}%</span>
        </div>
      `;

      headerBtn.addEventListener("click", () => {
        toggleDisciplineAccordion(disc.id);
      });

      // Lista de Subtópicos
      const topicsList = document.createElement("div");
      topicsList.className = "discipline-topics-list";
      topicsList.id = `topics-list-${disc.id}`;

      for (const topic of disc.topics) {
        const checked = isTopicChecked(topic.id);
        const itemEl = document.createElement("div");
        itemEl.className = `topic-item${checked ? " is-checked" : ""}`;
        itemEl.id = `topic-card-${topic.id}`;
        itemEl.setAttribute("data-topic-item", topic.id);

        const labelEl = document.createElement("label");
        labelEl.className = "topic-label";
        labelEl.setAttribute("for", `checkbox-${topic.id}`);

        const checkboxWrap = document.createElement("div");
        checkboxWrap.className = "topic-checkbox-wrapper";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "topic-checkbox";
        checkbox.id = `checkbox-${topic.id}`;
        checkbox.checked = checked;
        checkbox.setAttribute("data-topic-checkbox", topic.id);
        checkbox.setAttribute("aria-label", `Marcar subtópico ${topic.code} como estudado`);

        checkbox.addEventListener("change", (e) => {
          handleTopicToggle(topic.id, e.target.checked);
        });

        checkboxWrap.appendChild(checkbox);

        const contentWrap = document.createElement("div");
        contentWrap.className = "topic-content-wrap";

        const pText = document.createElement("p");
        pText.className = "topic-full-text";
        pText.setAttribute("data-topic-text", topic.id);
        // Preserva literalmente o texto completo do subtópico
        pText.textContent = topic.fullText;

        const statusTag = document.createElement("span");
        statusTag.className = `topic-status-tag ${checked ? "tag-completed" : "tag-pending"}`;
        statusTag.setAttribute("data-topic-tag", topic.id);
        statusTag.textContent = checked ? "✓ Assunto estudado" : "Pendente de estudo";

        contentWrap.appendChild(pText);
        contentWrap.appendChild(statusTag);

        labelEl.appendChild(checkboxWrap);
        labelEl.appendChild(contentWrap);
        itemEl.appendChild(labelEl);

        // Renderiza os links de acesso preservando literalmente todos os fornecidos
        if (topic.links && topic.links.length > 0) {
          const linksList = document.createElement("div");
          linksList.className = "topic-links-list";

          for (const linkObj of topic.links) {
            const linkRow = document.createElement("div");
            linkRow.className = "topic-link-entry";

            if (linkObj.url) {
              const prefix = document.createElement("span");
              prefix.textContent = "Link de acesso: ";
              const anchor = document.createElement("a");
              anchor.href = linkObj.url;
              anchor.target = "_blank";
              anchor.rel = "noopener noreferrer";
              anchor.className = "topic-link-anchor";
              anchor.textContent = linkObj.value;
              linkRow.appendChild(prefix);
              linkRow.appendChild(anchor);
            } else {
              // Preserva texto original dos nomes de arquivos (item 5.5) sem inventar URL
              const rawSpan = document.createElement("span");
              rawSpan.className = "topic-link-filename";
              rawSpan.textContent = linkObj.rawText;
              linkRow.appendChild(rawSpan);
            }

            linksList.appendChild(linkRow);
          }

          itemEl.appendChild(linksList);
        }

        topicsList.appendChild(itemEl);
      }

      section.appendChild(headerBtn);
      section.appendChild(topicsList);
      fragment.appendChild(section);
    }

    dom.editalDisciplinesContainer.innerHTML = "";
    dom.editalDisciplinesContainer.appendChild(fragment);
  }

  function getDisciplineStatusText(dStat) {
    if (dStat.isComplete) return "Concluída (100%)";
    if (dStat.completed > 0) return "Em estudo";
    return "Pendente";
  }

  function getDisciplineStatusClass(dStat) {
    if (dStat.isComplete) return "status-done";
    if (dStat.completed > 0) return "status-in-progress";
    return "";
  }

  /**
   * Atualiza todos os contadores, barras de progresso e cartões sem recriar o DOM
   */
  function updateDashboardUI() {
    const stats = computeStats();

    // Progresso Geral
    dom.statTotalCount.textContent = String(stats.totalTopics);
    dom.statCompletedCount.textContent = String(stats.completedTopics);
    dom.statPendingCount.textContent = String(stats.pendingTopics);

    dom.overallPercentageRing.textContent = `${stats.overallPercent}%`;
    dom.overallPercentageText.textContent = `${stats.overallPercent}%`;
    dom.overallFractionLabel.textContent = `${stats.completedTopics} de ${stats.totalTopics} tópicos concluídos (${stats.overallPercent}%)`;
    dom.overallProgressBar.style.width = `${stats.overallPercent}%`;
    dom.overallProgressbarWrap.setAttribute("aria-valuenow", String(stats.overallPercent));

    // Atualiza círculo SVG (r = 46 => circunferência = 2 * PI * 46 = 289.0265)
    const circumference = 289.03;
    const offset = circumference - (stats.overallPercent / 100) * circumference;
    dom.overallProgressCircle.style.strokeDashoffset = String(offset);

    if (stats.completedTopics === 0) {
      dom.overallStatusPill.textContent = "Iniciando estudos";
    } else if (stats.completedTopics === stats.totalTopics) {
      dom.overallStatusPill.textContent = "Edital 100% Concluído!";
    } else {
      dom.overallStatusPill.textContent = `${stats.pendingTopics} assunto(s) restante(s)`;
    }

    // Botão de Acesso Rápido aos Pendentes
    dom.btnQuickPendingText.textContent =
      stats.pendingTopics > 0
        ? `Acesso Rápido: Ver Assuntos Não Estudados (${stats.pendingTopics})`
        : "Todos os Assuntos Foram Estudados! (0 pendentes)";

    // Badges dos filtros
    dom.badgeFilterAll.textContent = String(stats.totalTopics);
    dom.badgeFilterPending.textContent = String(stats.pendingTopics);
    dom.badgeFilterCompleted.textContent = String(stats.completedTopics);
    dom.badgeFilterLaws.textContent = String(stats.topicsWithLaws);

    // Atualiza cada uma das 10 disciplinas (mini-card e cabeçalho da seção)
    for (const disc of EDITAL_DATA.disciplines) {
      const dStat = stats.disciplineStats[disc.id];

      // Mini-card na tela inicial
      const miniCard = document.querySelector(`[data-disc-overview-id="${disc.id}"]`);
      if (miniCard) {
        miniCard.classList.toggle("is-complete", dStat.isComplete);
      }
      const miniPercent = document.querySelector(`[data-mini-percent="${disc.id}"]`);
      if (miniPercent) miniPercent.textContent = `${dStat.percent}%`;

      const miniBar = document.querySelector(`[data-mini-bar="${disc.id}"]`);
      if (miniBar) miniBar.style.width = `${dStat.percent}%`;

      const miniCompleted = document.querySelector(`[data-mini-completed="${disc.id}"]`);
      if (miniCompleted) miniCompleted.textContent = `${dStat.completed}/${dStat.total} estudados`;

      const miniPending = document.querySelector(`[data-mini-pending="${disc.id}"]`);
      if (miniPending) {
        miniPending.textContent = dStat.pending === 0 ? "Concluída" : `${dStat.pending} pendente(s)`;
      }

      // Seção da disciplina
      const sectionEl = document.getElementById(`section-${disc.id}`);
      if (sectionEl) {
        sectionEl.classList.toggle("discipline-completed", dStat.isComplete);
      }

      const statusBadge = document.querySelector(`[data-disc-status="${disc.id}"]`);
      if (statusBadge) {
        statusBadge.className = `discipline-status-badge ${getDisciplineStatusClass(dStat)}`;
        statusBadge.textContent = getDisciplineStatusText(dStat);
      }

      const countsLabel = document.querySelector(`[data-disc-counts="${disc.id}"]`);
      if (countsLabel) {
        countsLabel.textContent = `${dStat.completed} de ${dStat.total} concluídos (${dStat.pending} pendentes)`;
      }

      const discBar = document.querySelector(`[data-disc-bar="${disc.id}"]`);
      if (discBar) discBar.style.width = `${dStat.percent}%`;

      const discProgressbar = document.querySelector(`[data-disc-progressbar="${disc.id}"]`);
      if (discProgressbar) discProgressbar.setAttribute("aria-valuenow", String(dStat.percent));

      const discPercent = document.querySelector(`[data-disc-percent="${disc.id}"]`);
      if (discPercent) discPercent.textContent = `${dStat.percent}%`;
    }
  }

  /**
   * Manipula a marcação/desmarcação de um subtópico
   */
  async function handleTopicToggle(topicId, checked) {
    if (checked) {
      state.progressMap[topicId] = {
        checked: true,
        updatedAt: new Date().toISOString()
      };
    } else {
      delete state.progressMap[topicId];
    }

    // Atualiza visual do item imediatamente
    const itemCard = document.getElementById(`topic-card-${topicId}`);
    if (itemCard) {
      itemCard.classList.toggle("is-checked", checked);
    }

    const checkboxEl = document.getElementById(`checkbox-${topicId}`);
    if (checkboxEl && checkboxEl.checked !== checked) {
      checkboxEl.checked = checked;
    }

    const statusTag = document.querySelector(`[data-topic-tag="${topicId}"]`);
    if (statusTag) {
      statusTag.className = `topic-status-tag ${checked ? "tag-completed" : "tag-pending"}`;
      statusTag.textContent = checked ? "✓ Assunto estudado" : "Pendente de estudo";
    }

    // Atualiza contadores e barras
    updateDashboardUI();

    // Se o usuário estiver filtrando por pendentes ou concluídos, reaplica a visibilidade
    if (state.currentFilter === "pending" || state.currentFilter === "completed") {
      applySearchAndFilters();
    }

    // Salva no IndexedDB e localStorage
    await editalStorage.setTopicChecked(topicId, checked);
  }

  /**
   * Aplica busca por texto, filtro de status (Todos, Pendentes, Concluídos, Com Leis)
   * e filtro de disciplina selecionada.
   */
  function applySearchAndFilters() {
    const queryNorm = normalizeForSearch(state.searchQuery.trim());
    let visibleDisciplinesCount = 0;
    let visibleTopicsCount = 0;

    for (const disc of EDITAL_DATA.disciplines) {
      const sectionEl = document.getElementById(`section-${disc.id}`);
      if (!sectionEl) continue;

      if (state.selectedDisciplineId && state.selectedDisciplineId !== disc.id) {
        sectionEl.hidden = true;
        continue;
      }

      const discTitleNorm = normalizeForSearch(disc.fullTitle);
      const discMatchesQuery = queryNorm && discTitleNorm.includes(queryNorm);

      let discVisibleTopics = 0;

      for (const topic of disc.topics) {
        const itemEl = document.getElementById(`topic-card-${topic.id}`);
        if (!itemEl) continue;

        const checked = isTopicChecked(topic.id);
        const hasLaws = Boolean(topic.links && topic.links.length > 0);

        // Verifica filtro de status
        let matchesFilter = true;
        if (state.currentFilter === "pending") {
          matchesFilter = !checked;
        } else if (state.currentFilter === "completed") {
          matchesFilter = checked;
        } else if (state.currentFilter === "laws") {
          matchesFilter = hasLaws;
        }

        // Verifica pesquisa textual (disciplina, número do item, assunto, lei ou link)
        let matchesQuery = true;
        if (queryNorm) {
          const topicTextNorm = normalizeForSearch(topic.fullText);
          const linksTextNorm = normalizeForSearch(
            (topic.links || []).map((l) => l.rawText).join(" ")
          );
          matchesQuery =
            discMatchesQuery ||
            topicTextNorm.includes(queryNorm) ||
            linksTextNorm.includes(queryNorm);
        }

        const isVisible = matchesFilter && matchesQuery;
        itemEl.hidden = !isVisible;

        if (isVisible) {
          discVisibleTopics += 1;
          visibleTopicsCount += 1;
        }
      }

      const showDiscipline = discVisibleTopics > 0;
      sectionEl.hidden = !showDiscipline;

      if (showDiscipline) {
        visibleDisciplinesCount += 1;
        // Se há busca ou filtro ativo, expande a disciplina para mostrar os resultados
        if (queryNorm || state.currentFilter !== "all" || state.selectedDisciplineId) {
          setDisciplineCollapsed(disc.id, false);
        }
      }
    }

    // Banner de filtro ativo
    const hasActiveFilter =
      Boolean(queryNorm) ||
      state.currentFilter !== "all" ||
      Boolean(state.selectedDisciplineId);

    dom.activeFilterBanner.hidden = !hasActiveFilter;
    dom.btnShowAllDisciplines.hidden = !state.selectedDisciplineId;

    if (hasActiveFilter) {
      const parts = [];
      if (state.selectedDisciplineId) {
        const d = EDITAL_DATA.disciplines.find((x) => x.id === state.selectedDisciplineId);
        if (d) parts.push(`Disciplina: ${d.fullTitle}`);
      }
      if (state.currentFilter === "pending") parts.push("Apenas tópicos pendentes");
      if (state.currentFilter === "completed") parts.push("Apenas tópicos estudados");
      if (state.currentFilter === "laws") parts.push("Apenas tópicos com links de leis");
      if (queryNorm) parts.push(`Pesquisa: "${state.searchQuery.trim()}"`);

      dom.activeFilterText.textContent = `Exibindo ${visibleTopicsCount} tópico(s) em ${visibleDisciplinesCount} disciplina(s) • ${parts.join(" | ")}`;
    }

    // Estado vazio
    dom.emptySearchState.hidden = visibleTopicsCount > 0;
  }

  /**
   * Define o filtro de abas (all, pending, completed, laws)
   */
  function setFilter(filterName) {
    state.currentFilter = filterName;

    dom.filterPills.forEach((pill) => {
      const isMatch = pill.getAttribute("data-filter") === filterName;
      pill.classList.toggle("active", isMatch);
      pill.setAttribute("aria-selected", isMatch ? "true" : "false");
    });

    applySearchAndFilters();
  }

  /**
   * Reseta todos os filtros e busca para mostrar o edital integral
   */
  function resetAllFilters() {
    state.searchQuery = "";
    state.selectedDisciplineId = null;
    dom.searchInput.value = "";
    dom.btnClearSearch.hidden = true;
    setFilter("all");
  }

  /**
   * Abre/fecha o acordeão de uma disciplina
   */
  function toggleDisciplineAccordion(discId) {
    const isCollapsed = state.collapsedDisciplines.has(discId);
    setDisciplineCollapsed(discId, !isCollapsed);
  }

  function setDisciplineCollapsed(discId, collapsed) {
    const sectionEl = document.getElementById(`section-${discId}`);
    if (!sectionEl) return;

    const headerBtn = sectionEl.querySelector(".discipline-header");
    if (collapsed) {
      state.collapsedDisciplines.add(discId);
      sectionEl.classList.add("is-collapsed");
      if (headerBtn) headerBtn.setAttribute("aria-expanded", "false");
    } else {
      state.collapsedDisciplines.delete(discId);
      sectionEl.classList.remove("is-collapsed");
      if (headerBtn) headerBtn.setAttribute("aria-expanded", "true");
    }
  }

  /**
   * Navega suavemente até uma disciplina específica e garante que ela esteja aberta
   */
  function navigateToDiscipline(discId) {
    if (state.selectedDisciplineId && state.selectedDisciplineId !== discId) {
      state.selectedDisciplineId = null;
      applySearchAndFilters();
    }

    setDisciplineCollapsed(discId, false);
    const sectionEl = document.getElementById(`section-${discId}`);
    if (sectionEl) {
      sectionEl.hidden = false;
      sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /**
   * Encontra o primeiro subtópico ainda não estudado e rola até ele
   */
  function goToNextPendingTopic() {
    if (state.currentFilter === "completed" || state.searchQuery || state.selectedDisciplineId) {
      resetAllFilters();
    }

    for (const disc of EDITAL_DATA.disciplines) {
      for (const topic of disc.topics) {
        if (!isTopicChecked(topic.id)) {
          setDisciplineCollapsed(disc.id, false);
          const itemEl = document.getElementById(`topic-card-${topic.id}`);
          if (itemEl) {
            itemEl.scrollIntoView({ behavior: "smooth", block: "center" });
            itemEl.classList.remove("highlight-pulse");
            void itemEl.offsetWidth;
            itemEl.classList.add("highlight-pulse");
          }
          return;
        }
      }
    }

    showToast("Parabéns! Você já concluiu todos os 88 tópicos do edital!");
  }

  /**
   * Exibe modal de confirmação antes de limpar todo o progresso
   */
  function openClearProgressModal() {
    const stats = computeStats();
    dom.modalCompletedCount.textContent = String(stats.completedTopics);
    dom.modalClearConfirm.hidden = false;
  }

  function closeClearProgressModal() {
    dom.modalClearConfirm.hidden = true;
  }

  async function confirmClearAllProgress() {
    state.progressMap = {};
    await editalStorage.clearAllProgress();

    // Desmarca todas as caixas de seleção no DOM
    const checkboxes = document.querySelectorAll(".topic-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = false;
    });

    const topicCards = document.querySelectorAll(".topic-item");
    topicCards.forEach((card) => {
      card.classList.remove("is-checked");
    });

    const tags = document.querySelectorAll("[data-topic-tag]");
    tags.forEach((tag) => {
      tag.className = "topic-status-tag tag-pending";
      tag.textContent = "Pendente de estudo";
    });

    updateDashboardUI();
    applySearchAndFilters();
    closeClearProgressModal();
    showToast("Progresso de estudos reiniciado com sucesso.");
  }

  /**
   * Exibe notificação rápida (Toast)
   */
  let toastTimeout = null;
  function showToast(message) {
    if (!dom.toastNotification) return;
    dom.toastNotification.textContent = message;
    dom.toastNotification.hidden = false;

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      dom.toastNotification.hidden = true;
    }, 3200);
  }

  /**
   * Gerencia alternância de tema Claro / Escuro
   */
  function initTheme() {
    const savedTheme = localStorage.getItem("gcm_santana_2026_theme") || "dark";
    applyTheme(savedTheme);

    dom.btnThemeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem("gcm_santana_2026_theme", next);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const metaTheme = document.getElementById("meta-theme-color");
    if (metaTheme) {
      metaTheme.setAttribute("content", theme === "dark" ? "#0A1931" : "#0D1F3C");
    }
  }

  /**
   * Monitora status de conexão (Online / Offline)
   */
  function initConnectivityStatus() {
    const updateStatus = () => {
      const online = navigator.onLine;
      if (online) {
        dom.connectionStatus.className = "badge-status status-online";
        dom.connectionStatusText.textContent = "Pronto Offline";
      } else {
        dom.connectionStatus.className = "badge-status status-offline";
        dom.connectionStatusText.textContent = "Modo Offline Ativo";
      }
    };

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    updateStatus();
  }

  /**
   * Configura instalação do PWA no Android e Desktop
   */
  function initPwaInstall() {
    const isNativeApk =
      navigator.userAgent.includes("MeuEditalGCMSantanaAPK") ||
      window.location.protocol === "file:";

    if (isNativeApk) {
      const btnApk = document.getElementById("btn-download-apk");
      if (btnApk) btnApk.hidden = true;
      if (dom.btnInstallHeader) dom.btnInstallHeader.hidden = true;
      return;
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      dom.pwaInstallBanner.hidden = false;
    });

    window.addEventListener("appinstalled", () => {
      state.deferredInstallPrompt = null;
      dom.pwaInstallBanner.hidden = true;
      showToast("Aplicativo Meu Edital GCM Santana 2026 instalado com sucesso!");
    });

    const triggerInstall = async () => {
      if (state.deferredInstallPrompt) {
        state.deferredInstallPrompt.prompt();
        const { outcome } = await state.deferredInstallPrompt.userChoice;
        if (outcome === "accepted") {
          dom.pwaInstallBanner.hidden = true;
        }
        state.deferredInstallPrompt = null;
      } else {
        dom.modalInstallHelp.hidden = false;
      }
    };

    dom.btnPwaInstallBanner.addEventListener("click", triggerInstall);
    dom.btnInstallHeader.addEventListener("click", triggerInstall);

    dom.btnPwaDismissBanner.addEventListener("click", () => {
      dom.pwaInstallBanner.hidden = true;
    });

    dom.btnCloseInstallHelp.addEventListener("click", () => {
      dom.modalInstallHelp.hidden = true;
    });
  }

  /**
   * Registra o Service Worker e gerencia atualizações sem prender o usuário em versão antiga
   */
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("./sw.js", {
          scope: "./"
        });

        // Verifica atualizações sempre que o app abrir online
        if (navigator.onLine) {
          registration.update().catch(() => {});
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
              showToast("Nova versão do aplicativo carregada. Seu progresso foi mantido!");
            }
          });
        });
      } catch (err) {
        console.warn("Falha ao registrar Service Worker:", err);
      }
    });
  }

  /**
   * Registra todos os eventos de interação da interface
   */
  function bindEvents() {
    // Pesquisa em tempo real
    dom.searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      dom.btnClearSearch.hidden = !state.searchQuery;
      applySearchAndFilters();
    });

    dom.btnClearSearch.addEventListener("click", () => {
      state.searchQuery = "";
      dom.searchInput.value = "";
      dom.btnClearSearch.hidden = true;
      applySearchAndFilters();
      dom.searchInput.focus();
    });

    // Abas de filtro (Todos, Pendentes, Concluídos, Com Leis)
    dom.filterPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const filter = pill.getAttribute("data-filter") || "all";
        setFilter(filter);
      });
    });

    // Botão de Acesso Rápido aos Assuntos Pendentes
    dom.btnQuickPending.addEventListener("click", () => {
      setFilter("pending");
      const targetSection = document.querySelector(".search-filter-section");
      if (targetSection) {
        targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    // Botão Ir ao Próximo Pendente
    dom.btnNextPending.addEventListener("click", () => {
      goToNextPendingTopic();
    });

    // Expandir / Recolher Todas as Disciplinas
    dom.btnExpandAll.addEventListener("click", () => {
      for (const disc of EDITAL_DATA.disciplines) {
        setDisciplineCollapsed(disc.id, false);
      }
    });

    dom.btnCollapseAll.addEventListener("click", () => {
      for (const disc of EDITAL_DATA.disciplines) {
        setDisciplineCollapsed(disc.id, true);
      }
    });

    // Resetar filtros
    dom.btnResetFilters.addEventListener("click", resetAllFilters);
    dom.btnEmptyReset.addEventListener("click", resetAllFilters);
    dom.btnShowAllDisciplines.addEventListener("click", () => {
      state.selectedDisciplineId = null;
      applySearchAndFilters();
    });

    // Modal de Limpar Progresso
    dom.btnClearProgress.addEventListener("click", openClearProgressModal);
    dom.btnCancelClear.addEventListener("click", closeClearProgressModal);
    dom.btnConfirmClear.addEventListener("click", confirmClearAllProgress);

    // Fechar modais com tecla Escape ou clique no backdrop
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeClearProgressModal();
        dom.modalInstallHelp.hidden = true;
      }
    });

    dom.modalClearConfirm.addEventListener("click", (e) => {
      if (e.target === dom.modalClearConfirm) closeClearProgressModal();
    });

    dom.modalInstallHelp.addEventListener("click", (e) => {
      if (e.target === dom.modalInstallHelp) dom.modalInstallHelp.hidden = true;
    });
  }

  /**
   * Inicialização da Aplicação
   */
  async function bootstrap() {
    cacheDomReferences();
    initTheme();
    initConnectivityStatus();
    initPwaInstall();

    // Carrega marcações salvas e armazena o edital no IndexedDB para garantia offline
    state.progressMap = await editalStorage.getAllProgress();
    editalStorage.cacheEditalContent(EDITAL_DATA);

    const initialStats = computeStats();
    renderDisciplinesOverview(initialStats);
    renderFullEditalChecklist(initialStats);
    updateDashboardUI();
    bindEvents();

    // Verifica parâmetro de atalho ?filter=pending
    const params = new URLSearchParams(window.location.search);
    if (params.get("filter") === "pending") {
      setFilter("pending");
    }

    registerServiceWorker();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
