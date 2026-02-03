// ============================================
// BC Tube - PubMed Breast Cancer Paper Viewer
// ============================================

const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const PER_PAGE = 10;

let state = {
  query: "breast cancer",
  sort: "date",
  page: 0,
  totalResults: 0,
  ids: [],
  papers: [],
};

// --- DOM Elements ---
const searchInput = document.getElementById("searchInput");
const sortOrder = document.getElementById("sortOrder");
const searchBtn = document.getElementById("searchBtn");
const papersList = document.getElementById("papersList");
const resultsCount = document.getElementById("resultsCount");
const loading = document.getElementById("loading");
const pagination = document.getElementById("pagination");
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modalBody");
const modalClose = document.getElementById("modalClose");
const tags = document.querySelectorAll(".tag");

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  searchPapers();
  bindEvents();
});

function bindEvents() {
  searchBtn.addEventListener("click", () => {
    const extra = searchInput.value.trim();
    const activeTag = document.querySelector(".tag.active");
    const base = activeTag ? activeTag.dataset.query : "breast cancer";
    state.query = extra ? `${base} ${extra}` : base;
    state.page = 0;
    searchPapers();
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchBtn.click();
  });

  sortOrder.addEventListener("change", () => {
    state.sort = sortOrder.value;
    state.page = 0;
    searchPapers();
  });

  tags.forEach((tag) => {
    tag.addEventListener("click", () => {
      tags.forEach((t) => t.classList.remove("active"));
      tag.classList.add("active");
      const extra = searchInput.value.trim();
      state.query = extra
        ? `${tag.dataset.query} ${extra}`
        : tag.dataset.query;
      state.page = 0;
      searchPapers();
    });
  });

  modalClose.addEventListener("click", closeModal);
  document.querySelector(".modal-overlay").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// --- PubMed API ---

async function searchPapers() {
  showLoading(true);
  papersList.innerHTML = "";
  pagination.innerHTML = "";
  resultsCount.textContent = "";

  try {
    const sort = state.sort === "date" ? "date" : "relevance";
    const retstart = state.page * PER_PAGE;
    const searchUrl =
      `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(state.query)}` +
      `&retmax=${PER_PAGE}&retstart=${retstart}&sort=${sort}&retmode=json`;

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const result = searchData.esearchresult;

    state.totalResults = parseInt(result.count, 10);
    state.ids = result.idlist || [];

    if (state.ids.length === 0) {
      showEmpty();
      showLoading(false);
      return;
    }

    resultsCount.textContent = `${state.totalResults.toLocaleString()} 件の論文が見つかりました`;

    // Fetch summaries
    const summaryUrl =
      `${PUBMED_BASE}/esummary.fcgi?db=pubmed&id=${state.ids.join(",")}&retmode=json`;
    const summaryRes = await fetch(summaryUrl);
    const summaryData = await summaryRes.json();

    // Fetch abstracts via efetch XML
    const fetchUrl =
      `${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${state.ids.join(",")}&rettype=xml&retmode=xml`;
    const fetchRes = await fetch(fetchUrl);
    const fetchText = await fetchRes.text();
    const abstractsMap = parseAbstracts(fetchText);

    state.papers = state.ids.map((id) => {
      const s = summaryData.result[id];
      if (!s) return null;
      return {
        pmid: id,
        title: s.title || "",
        authors: (s.authors || []).map((a) => a.name).join(", "),
        journal: s.fulljournalname || s.source || "",
        pubdate: s.pubdate || "",
        volume: s.volume || "",
        issue: s.issue || "",
        pages: s.pages || "",
        doi: (s.elocationid || "").replace("doi: ", ""),
        abstract: abstractsMap[id] || "",
        keywords: abstractsMap[`kw_${id}`] || [],
      };
    }).filter(Boolean);

    renderPapers();
    renderPagination();
  } catch (err) {
    console.error("PubMed API error:", err);
    papersList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#x26A0;</div>
        <p>論文の取得中にエラーが発生しました。<br>しばらくしてから再度お試しください。</p>
      </div>`;
  }

  showLoading(false);
}

function parseAbstracts(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");
  const articles = xml.querySelectorAll("PubmedArticle");
  const map = {};

  articles.forEach((article) => {
    const pmidEl = article.querySelector("PMID");
    if (!pmidEl) return;
    const pmid = pmidEl.textContent;

    // Abstract
    const abstractTexts = article.querySelectorAll("AbstractText");
    if (abstractTexts.length > 0) {
      const parts = [];
      abstractTexts.forEach((at) => {
        const label = at.getAttribute("Label");
        const text = at.textContent;
        if (label) {
          parts.push(`[${label}] ${text}`);
        } else {
          parts.push(text);
        }
      });
      map[pmid] = parts.join("\n\n");
    }

    // Keywords
    const kwEls = article.querySelectorAll("Keyword");
    if (kwEls.length > 0) {
      map[`kw_${pmid}`] = Array.from(kwEls).map((kw) => kw.textContent);
    }
  });

  return map;
}

// --- Render ---

function renderPapers() {
  papersList.innerHTML = "";

  state.papers.forEach((paper) => {
    const card = document.createElement("div");
    card.className = "paper-card";
    card.addEventListener("click", () => openModal(paper));

    const abstractPreview = paper.abstract
      ? paper.abstract.replace(/\[.*?\]\s*/g, "").substring(0, 200) + "..."
      : "アブストラクトなし";

    card.innerHTML = `
      <div class="paper-date">${escapeHtml(paper.pubdate)}</div>
      <div class="paper-title">${escapeHtml(paper.title)}</div>
      <div class="paper-authors">${escapeHtml(paper.authors)}</div>
      <div class="paper-journal">${escapeHtml(paper.journal)}${paper.volume ? ` ${paper.volume}` : ""}${paper.issue ? `(${paper.issue})` : ""}${paper.pages ? `: ${paper.pages}` : ""}</div>
      <div class="paper-abstract-preview">${escapeHtml(abstractPreview)}</div>
    `;
    papersList.appendChild(card);
  });
}

function renderPagination() {
  pagination.innerHTML = "";
  const totalPages = Math.ceil(state.totalResults / PER_PAGE);
  if (totalPages <= 1) return;

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "< 前へ";
  prevBtn.disabled = state.page === 0;
  prevBtn.addEventListener("click", () => {
    state.page--;
    searchPapers();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  const pageInfo = document.createElement("span");
  pageInfo.className = "page-info";
  const displayPage = state.page + 1;
  const displayTotal = Math.min(totalPages, 100);
  pageInfo.textContent = `${displayPage} / ${displayTotal}`;

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "次へ >";
  nextBtn.disabled = state.page >= totalPages - 1 || state.page >= 99;
  nextBtn.addEventListener("click", () => {
    state.page++;
    searchPapers();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  pagination.appendChild(prevBtn);
  pagination.appendChild(pageInfo);
  pagination.appendChild(nextBtn);
}

// --- Modal ---

function openModal(paper) {
  const doiLink = paper.doi
    ? `<a href="https://doi.org/${encodeURIComponent(paper.doi)}" target="_blank" rel="noopener">DOI: ${escapeHtml(paper.doi)}</a>`
    : "";
  const pubmedLink = `<a href="https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/" target="_blank" rel="noopener">PubMed: ${paper.pmid}</a>`;

  const abstractHtml = paper.abstract
    ? formatAbstract(paper.abstract)
    : "<p style='color: var(--gray-400)'>アブストラクトは利用できません。</p>";

  const keywordsHtml =
    paper.keywords.length > 0
      ? `<div style="margin-top: 1.25rem;">
           <div class="detail-section-title">Keywords</div>
           <div class="detail-keywords">${paper.keywords.map((k) => `<span>${escapeHtml(k)}</span>`).join("")}</div>
         </div>`
      : "";

  modalBody.innerHTML = `
    <div class="detail-date">${escapeHtml(paper.pubdate)}</div>
    <div class="detail-title">${escapeHtml(paper.title)}</div>
    <div class="detail-authors">${escapeHtml(paper.authors)}</div>
    <div class="detail-journal">${escapeHtml(paper.journal)}${paper.volume ? ` ${paper.volume}` : ""}${paper.issue ? `(${paper.issue})` : ""}${paper.pages ? `: ${paper.pages}` : ""}</div>
    <div class="detail-ids">${pubmedLink}${doiLink}</div>
    <div class="detail-section-title">Abstract</div>
    <div class="detail-abstract">${abstractHtml}</div>
    ${keywordsHtml}
  `;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

function formatAbstract(text) {
  return text
    .split("\n\n")
    .map((para) => {
      const labelMatch = para.match(/^\[(.+?)\]\s*(.*)/s);
      if (labelMatch) {
        return `<p><strong>${escapeHtml(labelMatch[1])}:</strong> ${escapeHtml(labelMatch[2])}</p>`;
      }
      return `<p>${escapeHtml(para)}</p>`;
    })
    .join("");
}

// --- Utilities ---

function showLoading(show) {
  loading.classList.toggle("hidden", !show);
}

function showEmpty() {
  papersList.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">&#x1F50D;</div>
      <p>該当する論文が見つかりませんでした。<br>別のキーワードで検索してみてください。</p>
    </div>`;
  resultsCount.textContent = "0 件";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
