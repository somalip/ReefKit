var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../src/search-index.ts
var search_index_exports = {};
__export(search_index_exports, {
  addSectionsToIndex: () => addSectionsToIndex,
  addToIndex: () => addToIndex,
  createSearchIndex: () => createSearchIndex,
  deserializeIndex: () => deserializeIndex,
  facets: () => facets,
  findClosestWord: () => findClosestWord,
  getAllSections: () => getAllSections,
  getPopularQueries: () => getPopularQueries,
  getSnippet: () => getSnippet,
  getTotalResultCount: () => getTotalResultCount,
  levenshteinDistance: () => levenshteinDistance,
  parseExtendedQuery: () => parseExtendedQuery,
  removeFromIndex: () => removeFromIndex,
  searchSections: () => searchSections,
  searchWithPagination: () => searchWithPagination,
  serializeIndex: () => serializeIndex,
  suggest: () => suggest,
  trackQuery: () => trackQuery,
  updateRecord: () => updateRecord
});
function createTrieNode() {
  return {
    children: /* @__PURE__ */ new Map(),
    records: []
  };
}
function trieInsert(root, text, record) {
  let current = root;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!current.children.has(char)) {
      current.children.set(char, createTrieNode());
    }
    current = current.children.get(char);
    if (!current.records.some((r) => r.id === record.id)) {
      current.records.push(record);
    }
  }
}
function trieDelete(root, text, recordId) {
  let current = root;
  const path = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!current.children.has(char)) {
      return;
    }
    path.push({ node: current, char });
    current = current.children.get(char);
  }
  const nodesToClean = [];
  let tempCurrent = root;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (tempCurrent.children.has(char)) {
      tempCurrent = tempCurrent.children.get(char);
      tempCurrent.records = tempCurrent.records.filter((r) => r.id !== recordId);
      nodesToClean.push(tempCurrent);
    }
  }
  for (const node of nodesToClean) {
    if (node.records.length === 0 && node.children.size === 0) {
    }
  }
}
function triePrefixQuery(root, prefix) {
  let current = root;
  for (let i = 0; i < prefix.length; i++) {
    const char = prefix[i];
    if (!current.children.has(char)) {
      return [];
    }
    current = current.children.get(char);
  }
  return [...current.records];
}
function invalidateAffectedQueries(index, recordId, headingText, bodyText) {
  const recordTokens = /* @__PURE__ */ new Set();
  headingText.toLowerCase().split(/\s+/).forEach((token) => {
    if (token.length >= 2) recordTokens.add(token);
  });
  bodyText.toLowerCase().split(/\s+/).forEach((token) => {
    if (token.length >= 2) recordTokens.add(token);
  });
  const queriesToInvalidate = /* @__PURE__ */ new Set();
  for (const [query, entry] of index.queryCache.entries()) {
    if (entry.resultIds.includes(recordId)) {
      queriesToInvalidate.add(query);
      continue;
    }
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter((t) => t.length >= 2);
    for (const queryToken of queryTokens) {
      if (recordTokens.has(queryToken)) {
        queriesToInvalidate.add(query);
        break;
      }
    }
  }
  if (queriesToInvalidate.size > 0) {
    for (const query of queriesToInvalidate) {
      index.queryCache.delete(query);
    }
  } else {
    index.queryCache.clear();
  }
}
function jaccardSimilarity(tokens1, tokens2) {
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) intersection++;
  }
  const union = tokens1.size + tokens2.size - intersection;
  return intersection / union;
}
function extractTokensForMMR(text) {
  const tokens = text.toLowerCase().split(/\s+/);
  return new Set(tokens.filter((t) => t.length > 2));
}
function applyMMR(scoredEntries, lambda = 0.5) {
  if (scoredEntries.length <= 1) return scoredEntries;
  const results = [];
  const selectedTokens = [];
  const sortedByScore = [...scoredEntries].sort((a, b) => b[1] - a[1]);
  results.push(sortedByScore[0]);
  selectedTokens.push(extractTokensForMMR(sortedByScore[0][0].headingText + " " + sortedByScore[0][0].bodyText));
  for (let i = 1; i < sortedByScore.length; i++) {
    const [record, originalScore] = sortedByScore[i];
    const recordText = record.headingText + " " + record.bodyText;
    const recordTokens = extractTokensForMMR(recordText);
    let maxSimilarity = 0;
    for (const selectedTokenSet of selectedTokens) {
      const similarity = jaccardSimilarity(recordTokens, selectedTokenSet);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
    const mmrScore = (1 - lambda) * originalScore + lambda * (1 - maxSimilarity);
    let inserted = false;
    for (let j = 0; j < results.length; j++) {
      if (mmrScore > results[j][1]) {
        results.splice(j, 0, [record, mmrScore]);
        selectedTokens.splice(j, 0, recordTokens);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      results.push([record, mmrScore]);
      selectedTokens.push(recordTokens);
    }
  }
  return results;
}
function createSearchIndex() {
  return {
    headingIndex: /* @__PURE__ */ new Map(),
    headingIds: /* @__PURE__ */ new Map(),
    bodyIndex: /* @__PURE__ */ new Map(),
    allSections: [],
    queryCache: /* @__PURE__ */ new Map(),
    popularQueries: [],
    docFrequency: /* @__PURE__ */ new Map(),
    fieldDocFreq: {
      headingText: /* @__PURE__ */ new Map(),
      bodyText: /* @__PURE__ */ new Map(),
      label: /* @__PURE__ */ new Map(),
      breadcrumb: /* @__PURE__ */ new Map()
    },
    totalDocs: 0,
    queryPopularity: /* @__PURE__ */ new Map(),
    version: 1,
    headingTrie: createTrieNode()
  };
}
function addToIndex(index, records, tokenizePipeline) {
  index.totalDocs += records.length;
  for (const record of records) {
    const headingLower = record.headingText.toLowerCase();
    if (headingLower.length >= 2) {
      const existing = index.headingIds.get(headingLower) ?? [];
      existing.push(record);
      index.headingIds.set(headingLower, existing);
      const normalizedHeading2 = headingLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedHeading2 !== headingLower) {
        const normalizedExisting = index.headingIds.get(normalizedHeading2) ?? [];
        normalizedExisting.push(record);
        index.headingIds.set(normalizedHeading2, normalizedExisting);
      }
    }
    for (let i = 2; i <= headingLower.length; i++) {
      const prefix = headingLower.slice(0, i);
      const existing = index.headingIndex.get(prefix) ?? [];
      existing.push(record);
      index.headingIndex.set(prefix, existing);
    }
    const normalizedHeading = headingLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (let i = 2; i <= normalizedHeading.length; i++) {
      const prefix = normalizedHeading.slice(0, i);
      if (prefix !== headingLower.slice(0, i)) {
        const existing = index.headingIndex.get(prefix) ?? [];
        existing.push(record);
        index.headingIndex.set(prefix, existing);
      }
    }
    trieInsert(index.headingTrie, headingLower, record);
    if (normalizedHeading !== headingLower) {
      trieInsert(index.headingTrie, normalizedHeading, record);
    }
    const bodyLower = record.bodyText.toLowerCase();
    const bodyWords = bodyLower.split(/\s+/);
    for (const word of bodyWords) {
      if (word.length >= 3) {
        const existing = index.bodyIndex.get(word) ?? [];
        existing.push(record);
        index.bodyIndex.set(word, existing);
        const normalizedWord = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (normalizedWord !== word) {
          const normalizedExisting = index.bodyIndex.get(normalizedWord) ?? [];
          normalizedExisting.push(record);
          index.bodyIndex.set(normalizedWord, normalizedExisting);
        }
      }
    }
    for (const word of bodyWords) {
      if (word.length >= 2) {
        const currentFreq = index.docFrequency.get(word) ?? 0;
        index.docFrequency.set(word, currentFreq + 1);
        const currentBodyFreq = index.fieldDocFreq.bodyText.get(word) ?? 0;
        index.fieldDocFreq.bodyText.set(word, currentBodyFreq + 1);
      }
    }
    const headingWords = headingLower.split(/\s+/);
    for (const word of headingWords) {
      if (word.length >= 2) {
        const currentHeadingFreq = index.fieldDocFreq.headingText.get(word) ?? 0;
        index.fieldDocFreq.headingText.set(word, currentHeadingFreq + 1);
      }
    }
    if (record.label) {
      const labelLower = record.label.toLowerCase();
      const labelWords = labelLower.split(/\s+/);
      for (const word of labelWords) {
        if (word.length >= 2) {
          const currentLabelFreq = index.fieldDocFreq.label.get(word) ?? 0;
          index.fieldDocFreq.label.set(word, currentLabelFreq + 1);
        }
      }
    }
    if (record.breadcrumb) {
      const breadcrumbLower = record.breadcrumb.toLowerCase();
      const breadcrumbWords = breadcrumbLower.split(/\s+/);
      for (const word of breadcrumbWords) {
        if (word.length >= 2) {
          const currentBreadcrumbFreq = index.fieldDocFreq.breadcrumb.get(word) ?? 0;
          index.fieldDocFreq.breadcrumb.set(word, currentBreadcrumbFreq + 1);
        }
      }
    }
    if (record.label) {
      const labelLower = record.label.toLowerCase();
      if (labelLower.length >= 2) {
        const existing = index.bodyIndex.get(labelLower) ?? [];
        existing.push(record);
        index.bodyIndex.set(labelLower, existing);
      }
    }
    if (record.type === "structured" && record.structuredData) {
      if (record.structuredData.question) {
        const questionWords = record.structuredData.question.toLowerCase().split(/\s+/);
        for (const word of questionWords) {
          if (word.length >= 3) {
            const existing = index.bodyIndex.get(word) ?? [];
            existing.push(record);
            index.bodyIndex.set(word, existing);
          }
        }
      }
      if (record.structuredData.answer) {
        const answerWords = record.structuredData.answer.toLowerCase().split(/\s+/);
        for (const word of answerWords) {
          if (word.length >= 3) {
            const existing = index.bodyIndex.get(word) ?? [];
            existing.push(record);
            index.bodyIndex.set(word, existing);
          }
        }
      }
    }
  }
  index.allSections.push(...records);
}
function getAllSections(index) {
  return index.allSections;
}
function searchWithPagination(query, index, options = {}) {
  const pageSize = Math.max(1, options.pageSize ?? options.limit ?? 20);
  const offset = options.cursor ? Math.max(0, Number.parseInt(options.cursor, 10) || 0) : 0;
  const ranked = searchSections(query, index, { ...options, limit: Number.MAX_SAFE_INTEGER });
  const results = ranked.slice(offset, offset + pageSize).map(
    (record) => "score" in record ? record : { record, score: 0 }
  );
  const nextOffset = offset + results.length;
  return {
    results,
    total: ranked.length,
    hasMore: nextOffset < ranked.length,
    ...nextOffset < ranked.length ? { nextCursor: String(nextOffset) } : {}
  };
}
function getTotalResultCount(query, index, options = {}) {
  return searchSections(query, index, { ...options, limit: Number.MAX_SAFE_INTEGER }).length;
}
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] !== b[j - 1] ? 1 : 0)
      );
      prev = temp;
    }
  }
  return dp[n];
}
function findClosestWord(query, index, maxDistance = 2) {
  const term = query.trim().toLowerCase();
  if (!term || term.length < 2) return null;
  let closest = null;
  const checkWord = (word) => {
    if (!word || Math.abs(word.length - term.length) > maxDistance) return;
    const distance = levenshteinDistance(word, term);
    const current = closest;
    if (distance <= maxDistance && (!current || distance < current.distance)) {
      closest = { word, distance };
    }
  };
  for (const key of index.headingIds.keys()) {
    checkWord(key);
  }
  for (const key of index.bodyIndex.keys()) {
    checkWord(key);
  }
  return closest?.word ?? null;
}
function getLengthNorm(textLength, avgLength = 50) {
  const norm = 1 - Math.exp(-textLength / avgLength);
  return Math.max(0, Math.min(1, norm));
}
function findMatchPositions(text, query) {
  const positions = [];
  if (!query.trim() || !text) return positions;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let idx = 0;
  while ((idx = lowerText.indexOf(lowerQuery, idx)) !== -1) {
    positions.push({ start: idx, end: idx + query.length });
    idx += query.length;
  }
  return positions;
}
function parseExtendedQuery(query) {
  const tokens = tokenizeExtendedQuery(query);
  return buildQueryTree(tokens);
}
function tokenizeExtendedQuery(query) {
  const tokens = [];
  let rest = query;
  const exactRegex = /'([^']+)'/g;
  const excludeRegex = /!(\S+)/g;
  const prefixRegex = /\^(\S+)/g;
  const suffixRegex = /(\S+)\$/g;
  while (rest.length > 0) {
    let matched = false;
    const exactMatch = exactRegex.exec(rest);
    if (exactMatch && exactMatch.index === 0) {
      tokens.push({ type: "exact", value: exactMatch[1] });
      rest = rest.slice(exactMatch[0].length);
      matched = true;
      continue;
    }
    const excludeMatch = excludeRegex.exec(rest);
    if (excludeMatch && excludeMatch.index === 0) {
      tokens.push({ type: "exclude", value: excludeMatch[1] });
      rest = rest.slice(excludeMatch[0].length);
      matched = true;
      continue;
    }
    const prefixMatch = prefixRegex.exec(rest);
    if (prefixMatch && prefixMatch.index === 0) {
      tokens.push({ type: "prefix", value: prefixMatch[1] });
      rest = rest.slice(prefixMatch[0].length);
      matched = true;
      continue;
    }
    const suffixMatch = suffixRegex.exec(rest);
    if (suffixMatch && suffixMatch.index === 0) {
      tokens.push({ type: "suffix", value: suffixMatch[1] });
      rest = rest.slice(suffixMatch[0].length);
      matched = true;
      continue;
    }
    const pipeMatch = rest.match(/^\|/);
    if (pipeMatch) {
      tokens.push({ type: "or", value: "|" });
      rest = rest.slice(1);
      matched = true;
      continue;
    }
    const spaceMatch = rest.match(/^\s+/);
    if (spaceMatch && !matched) {
      rest = rest.slice(spaceMatch[0].length);
      continue;
    }
    const wordMatch = rest.match(/^(\S+)/);
    if (wordMatch) {
      const fieldMatch = wordMatch[1].match(/^([\w-]+):(.+)$/);
      tokens.push({ type: "term", value: fieldMatch ? `${fieldMatch[1]}:${fieldMatch[2]}` : wordMatch[1] });
      rest = rest.slice(wordMatch[0].length);
      matched = true;
    }
  }
  return tokens;
}
function buildQueryTree(tokens) {
  const result = { type: "and", children: [] };
  let currentOr = null;
  for (const token of tokens) {
    if (token.type === "or") {
      if (!currentOr) {
        currentOr = { type: "or", children: [] };
        result.children.push(currentOr);
      }
    } else {
      if (currentOr) {
        result.children.push(currentOr);
        currentOr = null;
      }
      result.children.push({ type: token.type, value: token.value });
    }
  }
  if (currentOr) {
    result.children.push(currentOr);
  }
  return result;
}
function getFuzzyCandidates(query, index, distance) {
  const candidates = /* @__PURE__ */ new Set();
  const queryLen = query.length;
  for (const [key, records] of index.headingIds) {
    if (Math.abs(key.length - queryLen) <= distance) {
      for (const record of records) {
        candidates.add(record);
      }
    }
  }
  for (const [key, records] of index.bodyIndex) {
    if (Math.abs(key.length - queryLen) <= distance) {
      for (const record of records) {
        candidates.add(record);
      }
    }
  }
  return candidates;
}
function matchExtendedNode(node, record) {
  switch (node.type) {
    case "term":
      const fieldMatch = node.value.match(/^([\w-]+):(.+)$/);
      const searchTerm = (fieldMatch ? fieldMatch[2] : node.value).toLowerCase();
      const field = fieldMatch?.[1].toLowerCase();
      const values = field === "title" || field === "heading" ? [record.headingText] : field === "body" ? [record.bodyText] : field === "label" ? [record.label ?? ""] : field === "breadcrumb" ? [record.breadcrumb] : field === "type" ? [record.type] : [record.headingText, record.bodyText, record.label ?? "", record.breadcrumb];
      return values.some((value) => value.toLowerCase().includes(searchTerm));
    case "exact":
      const exactTerm = node.value.toLowerCase();
      const phraseTokens = tokenizeForPhraseMatching(exactTerm);
      const headingTokens = tokenizeForPhraseMatching(record.headingText);
      const bodyTokens = tokenizeForPhraseMatching(record.bodyText);
      return hasPhraseMatch(headingTokens, phraseTokens) || hasPhraseMatch(bodyTokens, phraseTokens);
    case "exclude":
      const excludeTerm = node.value.toLowerCase();
      return !record.headingText.toLowerCase().includes(excludeTerm) && !record.bodyText.toLowerCase().includes(excludeTerm);
    case "prefix":
      const prefixTerm = node.value.toLowerCase();
      return record.headingText.toLowerCase().startsWith(prefixTerm) || record.bodyText.toLowerCase().startsWith(prefixTerm);
    case "suffix":
      const suffixTerm = node.value.toLowerCase();
      return record.headingText.toLowerCase().endsWith(suffixTerm) || record.bodyText.toLowerCase().endsWith(suffixTerm);
    case "and":
      return node.children.every((child) => matchExtendedNode(child, record));
    case "or":
      return node.children.some((child) => matchExtendedNode(child, record));
  }
}
function bm25Score(termFreq, docFreq, totalDocs, docLength, avgDocLength, k1 = 1.5, b = 0.75) {
  const idf = Math.log((totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
  const norm = 1 - b + b * (docLength / avgDocLength);
  return idf * (termFreq * (k1 + 1) / (termFreq + k1 * norm));
}
function bm25fScore(record, queryTerms, index, weights, k1 = 1.5, b = 0.75) {
  const avgDocLength = getAvgDocLength(index);
  const totalDocs = index.totalDocs;
  const docLength = record.headingText.length * (weights.headingText || 1) + record.bodyText.length * (weights.bodyText || 1) + (record.label ? record.label.length * (weights.label || 1) : 0) + (record.breadcrumb ? record.breadcrumb.length * (weights.breadcrumb || 1) : 0);
  let totalScore = 0;
  for (const term of queryTerms) {
    const termLower = term.toLowerCase();
    let weightedTermFreq = 0;
    let combinedDocFreq = 0;
    if (weights.headingText) {
      const headingText = record.headingText.toLowerCase();
      const headingTermFreq = countTermFrequency(headingText, termLower);
      const headingDocFreq = index.fieldDocFreq.headingText.get(termLower) || 1;
      weightedTermFreq += headingTermFreq * (weights.headingText || 1);
      combinedDocFreq = Math.max(combinedDocFreq, headingDocFreq);
    }
    if (weights.bodyText) {
      const bodyText = record.bodyText.toLowerCase();
      const bodyTermFreq = countTermFrequency(bodyText, termLower);
      const bodyDocFreq = index.fieldDocFreq.bodyText.get(termLower) || 1;
      weightedTermFreq += bodyTermFreq * (weights.bodyText || 1);
      combinedDocFreq = Math.max(combinedDocFreq, bodyDocFreq);
    }
    if (record.label && weights.label) {
      const labelText = record.label.toLowerCase();
      const labelTermFreq = countTermFrequency(labelText, termLower);
      const labelDocFreq = index.fieldDocFreq.label.get(termLower) || 1;
      weightedTermFreq += labelTermFreq * (weights.label || 1);
      combinedDocFreq = Math.max(combinedDocFreq, labelDocFreq);
    }
    if (record.breadcrumb && weights.breadcrumb) {
      const breadcrumbText = record.breadcrumb.toLowerCase();
      const breadcrumbTermFreq = countTermFrequency(breadcrumbText, termLower);
      const breadcrumbDocFreq = index.fieldDocFreq.breadcrumb.get(termLower) || 1;
      weightedTermFreq += breadcrumbTermFreq * (weights.breadcrumb || 1);
      combinedDocFreq = Math.max(combinedDocFreq, breadcrumbDocFreq);
    }
    if (weightedTermFreq > 0 && combinedDocFreq > 0) {
      const idf = Math.log((totalDocs - combinedDocFreq + 0.5) / (combinedDocFreq + 0.5) + 1);
      const norm = 1 - b + b * (docLength / avgDocLength);
      const bm25f = idf * (weightedTermFreq * (k1 + 1) / (weightedTermFreq + k1 * norm));
      totalScore += bm25f;
    }
  }
  return totalScore;
}
function countTermFrequency(text, term) {
  if (!text || !term) return 0;
  const words = text.split(/\s+/);
  let count = 0;
  for (const word of words) {
    if (word === term) count++;
  }
  return count;
}
function tokenizeForPhraseMatching(text) {
  if (!text) return [];
  return text.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
}
function hasPhraseMatch(textTokens, phraseTokens) {
  if (phraseTokens.length === 0) return true;
  if (phraseTokens.length > textTokens.length) return false;
  for (let i = 0; i <= textTokens.length - phraseTokens.length; i++) {
    let match = true;
    for (let j = 0; j < phraseTokens.length; j++) {
      if (textTokens[i + j] !== phraseTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}
function getSnippet(record, matches, contextChars = 60) {
  if (!record || !matches || matches.length === 0) return "";
  const text = record.bodyText || record.headingText || "";
  if (!text) return "";
  if (matches.length === 0) {
    return text.slice(0, contextChars * 2) + (text.length > contextChars * 2 ? "..." : "");
  }
  const sortedMatches = [...matches].sort((a, b) => a.start - b.start);
  let bestMatch = sortedMatches[0];
  for (const match of sortedMatches) {
    if (match.end - match.start > bestMatch.end - bestMatch.start) {
      bestMatch = match;
    }
  }
  const matchStart = bestMatch.start;
  const matchEnd = bestMatch.end;
  let start = Math.max(0, matchStart - contextChars);
  let end = Math.min(text.length, matchEnd + contextChars);
  if (start === 0) {
    end = Math.min(text.length, matchEnd + contextChars * 2);
  }
  if (end === text.length) {
    start = Math.max(0, matchStart - contextChars * 2);
  }
  const snippetText = text.slice(start, end);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  const snippetMatchStart = matchStart - start;
  const snippetMatchEnd = matchEnd - start;
  const beforeMatch = snippetText.slice(0, snippetMatchStart);
  const matchText = snippetText.slice(snippetMatchStart, snippetMatchEnd);
  const afterMatch = snippetText.slice(snippetMatchEnd);
  return prefix + beforeMatch + "<mark>" + matchText + "</mark>" + afterMatch + suffix;
}
function calculateProximityBonus(textTokens, queryTokens) {
  if (queryTokens.length <= 1) return 1;
  const termPositions = /* @__PURE__ */ new Map();
  for (let i = 0; i < textTokens.length; i++) {
    const token = textTokens[i];
    if (queryTokens.includes(token)) {
      if (!termPositions.has(token)) {
        termPositions.set(token, []);
      }
      termPositions.get(token).push(i);
    }
  }
  let totalProximity = 0;
  let pairCount = 0;
  for (let i = 0; i < queryTokens.length; i++) {
    for (let j = i + 1; j < queryTokens.length; j++) {
      const term1 = queryTokens[i];
      const term2 = queryTokens[j];
      const positions1 = termPositions.get(term1) || [];
      const positions2 = termPositions.get(term2) || [];
      if (positions1.length === 0 || positions2.length === 0) continue;
      let minDistance = Infinity;
      for (const pos1 of positions1) {
        for (const pos2 of positions2) {
          const distance = Math.abs(pos1 - pos2);
          if (distance < minDistance) {
            minDistance = distance;
          }
        }
      }
      if (minDistance !== Infinity) {
        const bonus = Math.max(1, 2 - minDistance * 0.1);
        totalProximity += bonus;
        pairCount++;
      }
    }
  }
  return pairCount > 0 ? 1 + (totalProximity - pairCount) / pairCount : 1;
}
function getAvgDocLength(index) {
  if (index.allSections.length === 0) return 50;
  const total = index.allSections.reduce((sum, r) => sum + r.bodyText.length + r.headingText.length, 0);
  return total / index.allSections.length;
}
function getCachedShortlist(query, index) {
  const cached = index.queryCache.get(query);
  if (cached) {
    const candidates = /* @__PURE__ */ new Set();
    for (const id of cached.resultIds) {
      const record = index.allSections.find((r) => r.id === id);
      if (record) candidates.add(record);
    }
    return candidates;
  }
  return null;
}
function cacheShortlist(query, records, index) {
  const entry = {
    resultIds: records.map((r) => r.id),
    timestamp: Date.now()
  };
  index.queryCache.set(query, entry);
  if (index.queryCache.size > 100) {
    const firstKey = index.queryCache.keys().next().value;
    if (firstKey !== void 0) {
      index.queryCache.delete(firstKey);
    }
  }
}
function searchSections(query, index, limitOrOptions) {
  let limit = 8;
  let options;
  if (typeof limitOrOptions === "number") {
    limit = limitOrOptions;
  } else if (limitOrOptions) {
    options = limitOrOptions;
    limit = limitOrOptions.limit ?? 8;
  }
  const q = query.trim();
  if (!q) {
    return index.allSections.slice(0, limit);
  }
  const normalizedQ = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const scores = /* @__PURE__ */ new Map();
  const matches = /* @__PURE__ */ new Map();
  const weights = { ...DEFAULT_WEIGHTS, ...options?.weights ?? {} };
  const avgLength = getAvgDocLength(index);
  const addScore = (record, score, key, start, end) => {
    scores.set(record, (scores.get(record) ?? 0) + score);
    const recordMatches = matches.get(record) ?? [];
    recordMatches.push({ key, start, end });
    matches.set(record, recordMatches);
  };
  const useBM25 = options?.scoringAlgorithm === "bm25";
  const useBM25F = options?.scoringAlgorithm === "bm25f";
  const bm25fConfig = options?.bm25fOptions || { k1: 1.5, b: 0.75 };
  const cached = getCachedShortlist(normalizedQ.toLowerCase(), index);
  const searchPool = cached ? [...cached] : index.allSections;
  const exact = index.headingIds.get(normalizedQ.toLowerCase()) ?? index.headingIds.get(q.toLowerCase());
  if (exact) {
    for (const record of exact) {
      const fieldWeight = weights.headingText ?? 1;
      const lengthNorm = getLengthNorm(record.headingText.length);
      let score;
      if (useBM25) {
        const termFreq = 1;
        const docFreq = index.docFrequency.get(normalizedQ.toLowerCase()) ?? 1;
        score = bm25Score(termFreq, docFreq, index.totalDocs, record.headingText.length + record.bodyText.length, avgLength) * 100;
      } else {
        score = 100 * fieldWeight * (1 + lengthNorm);
      }
      addScore(record, score, "headingText", 0, record.headingText.length);
    }
  }
  const prefix = index.headingIndex.get(normalizedQ.toLowerCase()) ?? index.headingIndex.get(q.toLowerCase());
  if (prefix) {
    for (const record of prefix) {
      if (scores.has(record)) continue;
      const fieldWeight = weights.headingText ?? 1;
      const lengthNorm = getLengthNorm(record.headingText.length);
      let score;
      if (useBM25) {
        const termFreq = 1;
        const docFreq = index.docFrequency.get(normalizedQ.toLowerCase()) ?? 1;
        score = bm25Score(termFreq, docFreq, index.totalDocs, record.headingText.length + record.bodyText.length, avgLength) * 50;
      } else {
        score = 50 * fieldWeight * (1 + lengthNorm);
      }
      const positions = findMatchPositions(record.headingText, q);
      if (positions.length > 0) {
        const pos = positions[0];
        addScore(record, score, "headingText", pos.start, pos.end);
      } else {
        addScore(record, score, "headingText", 0, Math.min(q.length, record.headingText.length));
      }
    }
  }
  const words = normalizedQ.toLowerCase().split(/\s+/);
  for (const word of words) {
    const bodyMatches = index.bodyIndex.get(word);
    if (bodyMatches) {
      for (const record of bodyMatches) {
        if (scores.has(record)) continue;
        const fieldWeight = weights.bodyText ?? 1;
        const lengthNorm = getLengthNorm(record.bodyText.length);
        let score;
        if (useBM25) {
          const termFreq = 1;
          const docFreq = index.docFrequency.get(word) ?? 1;
          score = bm25Score(termFreq, docFreq, index.totalDocs, record.headingText.length + record.bodyText.length, avgLength) * 20;
        } else {
          score = 20 * fieldWeight * (1 + lengthNorm);
        }
        const positions = findMatchPositions(record.bodyText, q);
        if (positions.length > 0) {
          const pos = positions[0];
          addScore(record, score, "bodyText", pos.start, pos.end);
        } else {
          addScore(record, score, "bodyText", 0, Math.min(word.length, record.bodyText.length));
        }
      }
    }
  }
  if (useBM25F && scores.size === 0) {
    const queryTerms = normalizedQ.toLowerCase().split(/\s+/);
    for (const record of index.allSections) {
      const score = bm25fScore(record, queryTerms, index, weights, bm25fConfig.k1, bm25fConfig.b);
      if (score > 0) {
        addScore(record, score * 100, "bm25f", 0, Math.min(normalizedQ.length, record.headingText.length + record.bodyText.length));
      }
    }
  }
  if (scores.size > 0) {
    const queryTerms = normalizedQ.toLowerCase().split(/\s+/);
    if (queryTerms.length > 1) {
      for (const [record, score] of scores.entries()) {
        const headingTokens = tokenizeForPhraseMatching(record.headingText);
        const bodyTokens = tokenizeForPhraseMatching(record.bodyText);
        const allTermsInHeading = queryTerms.every((term) => headingTokens.includes(term));
        const allTermsInBody = queryTerms.every((term) => bodyTokens.includes(term));
        if (allTermsInHeading || allTermsInBody) {
          const combinedTokens = [...headingTokens, ...bodyTokens];
          const proximityBonus = calculateProximityBonus(combinedTokens, queryTerms);
          scores.set(record, score * proximityBonus);
        }
        if (hasPhraseMatch(headingTokens, queryTerms) || hasPhraseMatch(bodyTokens, queryTerms)) {
          scores.set(record, score * 1.5);
        }
      }
    }
  }
  if (options?.trackPopularity) {
    const boostFactor = options.popularityBoost || 1.2;
    for (const [record, score] of scores.entries()) {
      const key = `${normalizedQ.toLowerCase()}||${record.id}`;
      const popularity = index.queryPopularity.get(key);
      if (popularity) {
        const popularityBoost = 1 + (popularity.count - 1) * 0.1;
        scores.set(record, score * popularityBoost * boostFactor);
      }
    }
  }
  if (options?.fuzzy) {
    const fuzzyDistance = options.fuzzyDistance ?? 2;
    if (scores.size === 0) {
      const candidates = getFuzzyCandidates(q.toLowerCase(), index, 1);
      for (const record of candidates) {
        if (scores.has(record)) continue;
        const headingLower = record.headingText.toLowerCase();
        const headingMatch = findMatchPositions(headingLower, q);
        if (headingMatch.length === 0) {
          const dist = levenshteinDistance(headingLower, q);
          if (dist <= 1) {
            const normalizedScore = (1 - dist / Math.max(q.length, headingLower.length)) * 60;
            const fieldWeight = weights.headingText ?? 1;
            const lengthNorm = getLengthNorm(record.headingText.length);
            addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), "headingText", 0, Math.min(q.length, headingLower.length));
          }
        }
        if (scores.has(record)) continue;
        const bodyLower = record.bodyText.toLowerCase();
        let bestDist = Infinity;
        let bestStart = 0;
        for (let i = 0; i <= bodyLower.length - q.length; i++) {
          const substr = bodyLower.slice(i, i + q.length);
          const dist = levenshteinDistance(q, substr);
          if (dist < bestDist) {
            bestDist = dist;
            bestStart = i;
          }
        }
        if (bestDist <= 1) {
          const normalizedScore = (1 - bestDist / Math.max(q.length, bodyLower.length)) * 40;
          const fieldWeight = weights.bodyText ?? 1;
          const lengthNorm = getLengthNorm(record.bodyText.length);
          addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), "bodyText", bestStart, bestStart + q.length);
        }
      }
    }
    if (scores.size === 0) {
      const candidates = getFuzzyCandidates(q.toLowerCase(), index, 2);
      for (const record of candidates) {
        if (scores.has(record)) continue;
        const headingLower = record.headingText.toLowerCase();
        const dist = levenshteinDistance(headingLower, q);
        if (dist <= 2) {
          const normalizedScore = (1 - dist / Math.max(q.length, headingLower.length)) * 30;
          const fieldWeight = weights.headingText ?? 1;
          const lengthNorm = getLengthNorm(record.headingText.length);
          addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), "headingText", 0, Math.min(q.length, headingLower.length));
        }
        if (scores.has(record)) continue;
        const bodyLower = record.bodyText.toLowerCase();
        let bestDist = Infinity;
        let bestStart = 0;
        for (let i = 0; i <= bodyLower.length - q.length; i++) {
          const substr = bodyLower.slice(i, i + q.length);
          const d = levenshteinDistance(q, substr);
          if (d < bestDist) {
            bestDist = d;
            bestStart = i;
          }
        }
        if (bestDist <= 2) {
          const normalizedScore = (1 - bestDist / Math.max(q.length, bodyLower.length)) * 20;
          const fieldWeight = weights.bodyText ?? 1;
          const lengthNorm = getLengthNorm(record.bodyText.length);
          addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), "bodyText", bestStart, bestStart + q.length);
        }
      }
    }
  }
  if ((options?.extended || /\b(?:title|heading|body|label|breadcrumb|type):\S+/i.test(q)) && scores.size === 0) {
    const parsed = parseExtendedQuery(q);
    for (const record of index.allSections) {
      if (matchExtendedNode(parsed, record)) {
        const fieldWeight = weights.headingText ?? 1;
        const lengthNorm = getLengthNorm(record.headingText.length);
        const score = 50 * fieldWeight * (1 + lengthNorm);
        addScore(record, score, "headingText", 0, Math.min(q.length, record.headingText.length));
      }
    }
  }
  let filteredScores = [...scores.entries()];
  if (options?.filter) {
    filteredScores = filteredScores.filter(([record]) => options.filter(record));
  }
  let sortedEntries = filteredScores.sort((a, b) => b[1] - a[1]);
  if (options?.sortFn) {
    sortedEntries = sortedEntries.sort((a, b) => {
      const aMatches = matches.get(a[0]) ?? [];
      const bMatches = matches.get(b[0]) ?? [];
      return options.sortFn({ record: a[0], score: a[1], matches: aMatches }, { record: b[0], score: b[1], matches: bMatches });
    });
  }
  if (options?.diversify) {
    const lambda = options.mmrLambda ?? 0.5;
    sortedEntries = applyMMR(sortedEntries, lambda);
  }
  const topRecords = sortedEntries.slice(0, limit).map(([record]) => record);
  if (options?.typeWeights) {
    const typeBoost = options.typeWeights;
    for (const record of topRecords) {
      const boost = typeBoost[record.type] ?? 1;
      const currentScore = scores.get(record);
      if (currentScore !== void 0 && boost !== 1) {
        scores.set(record, currentScore * boost);
      }
    }
    sortedEntries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const boostedRecords = sortedEntries.slice(0, limit).map(([record]) => record);
    cacheShortlist(q.toLowerCase(), boostedRecords, index);
    if (options?.includeScore || options?.includeMatches) {
      return boostedRecords.map((record) => {
        const recordMatches = matches.get(record) ?? [];
        const normalizedScore = scores.get(record) ?? 0;
        const maxScore = useBM25 ? 100 : 200;
        const score = Math.max(0, Math.min(1, 1 - normalizedScore / maxScore));
        return {
          record,
          score,
          matches: options.includeMatches ? recordMatches : void 0
        };
      });
    }
    return boostedRecords;
  }
  cacheShortlist(q.toLowerCase(), topRecords, index);
  if (options?.includeScore || options?.includeMatches) {
    return topRecords.map((record) => {
      const recordMatches = matches.get(record) ?? [];
      const normalizedScore = scores.get(record) ?? 0;
      const maxScore = useBM25 ? 100 : 200;
      const score = Math.max(0, Math.min(1, 1 - normalizedScore / maxScore));
      return {
        record,
        score,
        matches: options.includeMatches ? recordMatches : void 0
      };
    });
  }
  return topRecords;
}
function removeFromIndex(index, id) {
  const recordIndex = index.allSections.findIndex((r) => r.id === id);
  if (recordIndex === -1) return;
  const record = index.allSections[recordIndex];
  index.allSections.splice(recordIndex, 1);
  index.totalDocs = Math.max(0, index.totalDocs - 1);
  invalidateAffectedQueries(index, record.id, record.headingText, record.bodyText);
  const headingLower = record.headingText.toLowerCase();
  const headingIds = index.headingIds.get(headingLower);
  if (headingIds) {
    const idx = headingIds.findIndex((r) => r.id === id);
    if (idx !== -1) headingIds.splice(idx, 1);
    if (headingIds.length === 0) index.headingIds.delete(headingLower);
  }
  for (let i = 2; i <= headingLower.length; i++) {
    const prefix = headingLower.slice(0, i);
    const prefixRecords = index.headingIndex.get(prefix);
    if (prefixRecords) {
      const idx = prefixRecords.findIndex((r) => r.id === id);
      if (idx !== -1) prefixRecords.splice(idx, 1);
      if (prefixRecords.length === 0) index.headingIndex.delete(prefix);
    }
  }
  trieDelete(index.headingTrie, headingLower, id);
  const normalizedHeading = record.headingText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalizedHeading !== headingLower) {
    trieDelete(index.headingTrie, normalizedHeading, id);
  }
  const bodyWords = record.bodyText.toLowerCase().split(/\s+/);
  for (const word of bodyWords) {
    if (word.length < 3) continue;
    const bodyRecords = index.bodyIndex.get(word);
    if (bodyRecords) {
      const idx = bodyRecords.findIndex((r) => r.id === id);
      if (idx !== -1) bodyRecords.splice(idx, 1);
      if (bodyRecords.length === 0) index.bodyIndex.delete(word);
    }
  }
}
function updateRecord(index, record) {
  removeFromIndex(index, record.id);
  addToIndex(index, [record]);
  invalidateAffectedQueries(index, record.id, record.headingText, record.bodyText);
}
function serializeIndex(index) {
  const serializable = {
    allSections: index.allSections,
    headingIndex: Array.from(index.headingIndex.entries()),
    headingIds: Array.from(index.headingIds.entries()),
    bodyIndex: Array.from(index.bodyIndex.entries()),
    docFrequency: Array.from(index.docFrequency.entries()),
    fieldDocFreq: {
      headingText: Array.from(index.fieldDocFreq.headingText.entries()),
      bodyText: Array.from(index.fieldDocFreq.bodyText.entries()),
      label: Array.from(index.fieldDocFreq.label.entries()),
      breadcrumb: Array.from(index.fieldDocFreq.breadcrumb.entries())
    },
    totalDocs: index.totalDocs,
    popularQueries: index.popularQueries,
    queryPopularity: Array.from(index.queryPopularity.entries()),
    version: index.version
  };
  return JSON.stringify(serializable);
}
function deserializeIndex(json) {
  const parsed = JSON.parse(json);
  const fieldDocFreq = {
    headingText: /* @__PURE__ */ new Map(),
    bodyText: /* @__PURE__ */ new Map(),
    label: /* @__PURE__ */ new Map(),
    breadcrumb: /* @__PURE__ */ new Map()
  };
  const queryPopularity = /* @__PURE__ */ new Map();
  if (parsed.queryPopularity && Array.isArray(parsed.queryPopularity)) {
    for (const [key, value] of parsed.queryPopularity) {
      if (typeof value === "object" && value !== null) {
        queryPopularity.set(key, value);
      }
    }
  }
  if (!parsed.fieldDocFreq) {
    if (parsed.docFrequency) {
      for (const [term, freq] of parsed.docFrequency) {
        fieldDocFreq.bodyText.set(term, freq);
        fieldDocFreq.headingText.set(term, Math.floor(freq * 0.3));
        fieldDocFreq.label.set(term, Math.floor(freq * 0.1));
        fieldDocFreq.breadcrumb.set(term, Math.floor(freq * 0.1));
      }
    }
  } else {
    fieldDocFreq.headingText = new Map(parsed.fieldDocFreq.headingText ?? []);
    fieldDocFreq.bodyText = new Map(parsed.fieldDocFreq.bodyText ?? []);
    fieldDocFreq.label = new Map(parsed.fieldDocFreq.label ?? []);
    fieldDocFreq.breadcrumb = new Map(parsed.fieldDocFreq.breadcrumb ?? []);
  }
  const headingTrie = createTrieNode();
  if (parsed.headingIndex && Array.isArray(parsed.headingIndex)) {
    const headingIndexMap = new Map(parsed.headingIndex);
    const seenRecords = /* @__PURE__ */ new Set();
    for (const [prefix, records] of headingIndexMap.entries()) {
      if (prefix.length >= 2 && Array.isArray(records)) {
        for (const record of records) {
          if (seenRecords.has(record.id)) continue;
          seenRecords.add(record.id);
          const headingLower = record.headingText.toLowerCase();
          trieInsert(headingTrie, headingLower, record);
          const normalizedHeading = headingLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (normalizedHeading !== headingLower) {
            trieInsert(headingTrie, normalizedHeading, record);
          }
        }
      }
    }
  } else {
    const allSections = parsed.allSections ?? [];
    for (const record of allSections) {
      const headingLower = record.headingText.toLowerCase();
      trieInsert(headingTrie, headingLower, record);
      const normalizedHeading = headingLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedHeading !== headingLower) {
        trieInsert(headingTrie, normalizedHeading, record);
      }
    }
  }
  return {
    allSections: parsed.allSections ?? [],
    headingIndex: new Map(parsed.headingIndex ?? []),
    headingIds: new Map(parsed.headingIds ?? []),
    bodyIndex: new Map(parsed.bodyIndex ?? []),
    queryCache: /* @__PURE__ */ new Map(),
    popularQueries: parsed.popularQueries ?? [],
    docFrequency: new Map(parsed.docFrequency ?? []),
    fieldDocFreq,
    totalDocs: parsed.totalDocs ?? 0,
    queryPopularity,
    version: parsed.version ?? 1,
    headingTrie
  };
}
function suggest(query, index, limit = 10) {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return [];
  const suggestions = [];
  const seen = /* @__PURE__ */ new Set();
  const trieCandidates = triePrefixQuery(index.headingTrie, q);
  for (const record of trieCandidates) {
    if (suggestions.length >= limit) break;
    const heading = record.headingText;
    if (!seen.has(heading)) {
      seen.add(heading);
      suggestions.push(heading);
    }
  }
  if (suggestions.length < limit) {
    const candidates = index.headingIndex.get(q) ?? [];
    const prefixCandidates = index.headingIds.get(q) ?? [];
    const allCandidates = [...candidates, ...prefixCandidates];
    for (const record of allCandidates) {
      if (suggestions.length >= limit) break;
      const heading = record.headingText;
      if (!seen.has(heading)) {
        seen.add(heading);
        suggestions.push(heading);
      }
    }
  }
  if (suggestions.length < limit) {
    for (const [key, records] of index.headingIds) {
      if (suggestions.length >= limit) break;
      if (key.includes(q) && !seen.has(records[0].headingText)) {
        seen.add(records[0].headingText);
        suggestions.push(records[0].headingText);
      }
    }
  }
  return suggestions.slice(0, limit);
}
function facets(index) {
  const result = {
    section: 0,
    action: 0,
    field: 0,
    link: 0,
    file: 0,
    media: 0,
    structured: 0
  };
  for (const record of index.allSections) {
    result[record.type] = (result[record.type] ?? 0) + 1;
  }
  return result;
}
function trackQuery(index, query, selectedId) {
  const q = query.trim();
  if (!q) return;
  if (index.popularQueries.length >= 100) {
    index.popularQueries.shift();
  }
  index.popularQueries.push(q);
  if (selectedId) {
    const key = `${q}||${selectedId}`;
    const existing = index.queryPopularity.get(key);
    if (existing) {
      existing.count++;
    } else {
      index.queryPopularity.set(key, {
        query: q,
        recordId: selectedId,
        count: 1
      });
    }
  }
}
function getPopularQueries(index, n = 5) {
  const counts = /* @__PURE__ */ new Map();
  for (const q of index.popularQueries) {
    counts.set(q, (counts.get(q) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([q]) => q);
}
var addSectionsToIndex, DEFAULT_WEIGHTS;
var init_search_index = __esm({
  "../src/search-index.ts"() {
    "use strict";
    addSectionsToIndex = addToIndex;
    DEFAULT_WEIGHTS = {
      headingText: 2,
      bodyText: 1,
      label: 1.5,
      breadcrumb: 0.5
    };
  }
});

// ../src/cache.ts
var cache_exports = {};
__export(cache_exports, {
  clearCache: () => clearCache,
  loadIndex: () => loadIndex,
  loadSiteGraph: () => loadSiteGraph,
  openDB: () => openDB,
  saveIndex: () => saveIndex,
  saveSiteGraph: () => saveSiteGraph
});
async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: CACHE_VERSION_KEY });
      }
    };
  });
}
async function compressData(data) {
  if (typeof window === "undefined" || !window.CompressionStream) {
    return { compressed: false, data };
  }
  try {
    const blob = new Blob([data]).stream();
    const compressedStream = blob.pipeThrough(new CompressionStream("gzip"));
    const chunks = [];
    const reader = compressedStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new Uint8Array(value));
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return { compressed: true, data: result.buffer };
  } catch {
    return { compressed: false, data };
  }
}
async function decompressData(data) {
  if (typeof data === "string") {
    return data;
  }
  if (typeof window === "undefined" || !window.DecompressionStream) {
    throw new Error("Compressed data but no decompression available");
  }
  try {
    const blob = new Blob([data]).stream();
    const decompressedStream = blob.pipeThrough(new DecompressionStream("gzip"));
    const chunks = [];
    const reader = decompressedStream.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    return chunks.join("") + decoder.decode();
  } catch {
    throw new Error("Failed to decompress data");
  }
}
async function saveIndex(index, metadata) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const serializedIndex = serializeIndex(index);
  const { compressed, data } = await compressData(serializedIndex);
  const dataToStore = {
    [CACHE_VERSION_KEY]: metadata.versionHash,
    index: data,
    metadata,
    compressed
  };
  await new Promise((resolve, reject) => {
    const req = store.put(dataToStore);
    req.onsuccess = () => resolve(void 0);
    req.onerror = () => reject(req.error);
  });
}
async function loadIndex(ttl) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const allRecords = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!allRecords.length) return null;
  const record = allRecords[0];
  let serializedIndex = record.index;
  if (record.compressed) {
    try {
      serializedIndex = await decompressData(record.index);
    } catch (e) {
      console.warn("[reef] decompression failed, trying uncompressed fallback:", e);
      if (typeof record.index === "string") {
        serializedIndex = record.index;
      } else {
        return null;
      }
    }
  } else if (typeof record.index === "string") {
    serializedIndex = record.index;
  } else {
    return null;
  }
  const cached = deserializeIndex(serializedIndex);
  const metadata = record.metadata;
  if (ttl && metadata.buildTime) {
    const age = Date.now() - metadata.buildTime;
    if (age > ttl) {
      return null;
    }
  }
  return { index: cached, metadata };
}
async function clearCache() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve(void 0);
    req.onerror = () => reject(req.error);
  });
}
async function saveSiteGraph(graph, key = "site-graph") {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put({ [CACHE_VERSION_KEY]: `${key}:${graph.startUrl}`, graph, metadata: { versionHash: key, buildTime: Date.now(), pageMetadata: {} } });
}
async function loadSiteGraph(startUrl, key = "site-graph") {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  return new Promise((resolve) => {
    const req = tx.objectStore(STORE_NAME).get(`${key}:${startUrl}`);
    req.onsuccess = () => resolve(req.result?.graph ?? null);
    req.onerror = () => resolve(null);
  });
}
var DB_NAME, STORE_NAME, CACHE_VERSION_KEY;
var init_cache = __esm({
  "../src/cache.ts"() {
    "use strict";
    init_search_index();
    DB_NAME = "reef-index";
    STORE_NAME = "indices";
    CACHE_VERSION_KEY = "version";
  }
});

// src/background.ts
init_search_index();

// ../src/extraction.ts
function stripTags(value) {
  let result = "";
  let inTag = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "<" && inTag === false) {
      inTag = true;
    } else if (char === ">" && inTag === true) {
      inTag = false;
    } else if (inTag === false) {
      result += char;
    }
  }
  return result.replace(/\s+/g, " ").trim();
}
function generateSelector(element) {
  const path = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    } else if (current.className) {
      const classes = current.className.trim().split(/\s+/);
      if (classes.length) {
        selector += `.${classes.join(".")}`;
      }
    }
    let siblingIndex = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) {
        siblingIndex++;
      }
      sibling = sibling.previousElementSibling;
    }
    if (siblingIndex > 1) {
      selector += `:nth-child(${siblingIndex})`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  return path.length > 0 ? path.join(" > ") : element.tagName.toLowerCase();
}
function generateStableSelector(element) {
  const candidates = [];
  const push = (value) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };
  const escape = (value) => typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/(["\\])/g, "\\$1");
  for (const attr of ["data-testid", "data-test", "data-agent-id", "id"]) {
    const value = element.getAttribute(attr);
    if (value) push(attr === "id" ? `#${escape(value)}` : `[${attr}="${escape(value)}"]`);
  }
  const aria = element.getAttribute("aria-label");
  if (aria) push(`[aria-label="${escape(aria)}"]`);
  const role = element.getAttribute("role");
  const name = extractActionName(element);
  if (role && name) push(`[role="${escape(role)}"][aria-label="${escape(name)}"]`);
  if (role) push(`[role="${escape(role)}"]`);
  push(generateSelector(element));
  let sibling = element.previousElementSibling;
  let position = 1;
  while (sibling) {
    if (sibling.tagName === element.tagName) position++;
    sibling = sibling.previousElementSibling;
  }
  push(`xpath=//${element.tagName.toLowerCase()}[${position}]`);
  return candidates;
}
function extractHeadingId(fullMatch, text) {
  const idMatch = fullMatch.match(/\bid=["']([^"']+)['"]/i);
  if (idMatch?.[1]) return idMatch[1];
  const stripped = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return stripped || Math.random().toString(36).slice(2);
}
function hasExplicitId(fullMatch) {
  return /\bid=["'][^"']+["']/i.test(fullMatch);
}
function findParentSectionId(html, headingMatchEnd) {
  const afterHeading = html.slice(headingMatchEnd, headingMatchEnd + 500);
  const idMatch = afterHeading.match(/<section[^>]*id="([^"]+)"/i);
  if (idMatch?.[1]) return idMatch[1];
  const articleMatch = afterHeading.match(/<article[^>]*id="([^"]+)"/i);
  if (articleMatch?.[1]) return articleMatch[1];
  return null;
}
var headingCache = /* @__PURE__ */ new Map();
function extractSections(html, url) {
  if (headingCache.has(url)) {
    return headingCache.get(url);
  }
  const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const matches = [];
  const headingRegexGlobal = /<(h[1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match;
  headingRegexGlobal.lastIndex = 0;
  while ((match = headingRegexGlobal.exec(cleanHtml)) !== null) {
    const [, tag, text] = match;
    const headingText = stripTags(text);
    const level = parseInt(tag[1], 10);
    matches.push({
      level,
      index: match.index,
      text: headingText,
      id: extractHeadingId(match[0], headingText),
      hasRealId: hasExplicitId(match[0])
    });
  }
  const len = matches.length;
  const sections = new Array(len);
  for (let i = 0; i < len; i++) {
    const heading = matches[i];
    const nextHeading = matches[i + 1];
    const start = heading.index + heading.text.length;
    const end = nextHeading?.index ?? cleanHtml.length;
    const content = cleanHtml.slice(start, end);
    const bodyText = stripTags(content).replace(/\s+/g, " ").trim();
    let breadcrumb = "";
    for (let j = 0; j <= i; j++) {
      if (j > 0) breadcrumb += " \u203A ";
      breadcrumb += matches[j].text;
    }
    const parentSectionId = heading.hasRealId ? null : findParentSectionId(cleanHtml, heading.index + heading.text.length);
    const selector = heading.hasRealId ? "#" + heading.id : parentSectionId ? "#" + parentSectionId : void 0;
    sections[i] = {
      id: `${url}#${heading.id}`,
      url: `${url}#${heading.id}`,
      headingText: heading.text,
      headingId: heading.id,
      breadcrumb,
      bodyText,
      type: "section",
      selector
    };
  }
  headingCache.set(url, sections);
  return sections;
}
function extractActionName(element) {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();
  const ariaLabelledBy = element.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const labelledElement = document.getElementById(ariaLabelledBy);
    if (labelledElement?.textContent?.trim()) {
      return labelledElement.textContent.trim();
    }
  }
  const textContent = element.textContent?.trim();
  if (textContent) return textContent;
  const title = element.getAttribute("title");
  if (title?.trim()) return title.trim();
  return null;
}
function isDestructiveAction(label) {
  const destructiveVerbs = [
    "delete",
    "remove",
    "cancel subscription",
    "unsubscribe",
    "pay",
    "checkout",
    "submit order",
    "confirm"
  ];
  const lowerLabel = label.toLowerCase();
  return destructiveVerbs.some((verb) => lowerLabel.includes(verb));
}
function extractActions(html, url, excludeSelectors) {
  const actions = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const selectors = [
    "button",
    '[role="button"]',
    'input[type="button"]',
    'input[type="submit"]',
    "summary",
    "[data-reef-action]"
  ];
  const elements = Array.from(doc.querySelectorAll(selectors.join(",")));
  for (const element of elements) {
    if (excludeSelectors && element.matches(excludeSelectors)) continue;
    const label = extractActionName(element);
    if (!label) continue;
    const selectors2 = generateStableSelector(element);
    actions.push({
      id: `${url}#action-${actions.length}`,
      url,
      headingText: label,
      headingId: `action-${actions.length}`,
      breadcrumb: "",
      bodyText: label,
      type: "action",
      selector: selectors2[0],
      selectors: selectors2,
      destructive: isDestructiveAction(label),
      label
    });
  }
  return actions;
}
function extractFields(html, url) {
  const fields = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const formElements = Array.from(doc.querySelectorAll("form"));
  for (const form of formElements) {
    let breadcrumb = "";
    let current = form.parentElement;
    while (current && current !== doc.body) {
      if (current.matches('h1, h2, h3, h4, h5, h6, article, section, [role="main"], main')) {
        const headingText = current.textContent?.trim() || "";
        if (headingText) {
          breadcrumb = headingText;
        }
        break;
      }
      current = current.parentElement;
    }
    const inputs = Array.from(form.querySelectorAll("input, textarea, select"));
    for (const input of inputs) {
      if (input.matches('input[type="hidden"], input[type="button"], input[type="submit"], input[type="reset"]')) {
        continue;
      }
      let label = "";
      const id = input.id;
      if (id) {
        const labelElement = doc.querySelector(`label[for="${id}"]`);
        if (labelElement) {
          label = labelElement.textContent?.trim() || "";
        }
      }
      if (!label) {
        const parentLabel = input.closest("label");
        if (parentLabel) {
          label = parentLabel.textContent?.trim() || "";
          const inputElement2 = input;
          if (label && inputElement2.value && label.includes(inputElement2.value)) {
            label = label.replace(inputElement2.value, "").trim();
          }
        }
      }
      if (!label) {
        const inputElement2 = input;
        const placeholder = "placeholder" in inputElement2 ? inputElement2.placeholder : "";
        label = placeholder || input.getAttribute("aria-label") || "";
      }
      if (!label) continue;
      const selectors = generateStableSelector(input);
      const inputElement = input;
      fields.push({
        id: `${url}#field-${fields.length}`,
        url,
        headingText: label,
        headingId: `field-${fields.length}`,
        breadcrumb,
        bodyText: label,
        type: "field",
        selector: selectors[0],
        selectors,
        label,
        value: inputElement.value
      });
    }
  }
  return fields;
}
function extractHiddenContent(doc) {
  doc.querySelectorAll("details").forEach((d) => {
    if (!d.hasAttribute("open")) d.setAttribute("data-reef-was-closed", "true");
    d.setAttribute("open", "");
  });
  doc.querySelectorAll('[aria-hidden="false"]').forEach((el) => {
    el.removeAttribute("aria-hidden");
  });
}
function extractLinks(html, url) {
  const links = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  for (const anchor of anchors) {
    if (anchor.hasAttribute("rel") && anchor.getAttribute("rel")?.toLowerCase().includes("nofollow")) continue;
    const href = anchor.getAttribute("href");
    if (!href) continue;
    if (href === "#" || href.startsWith("javascript:")) continue;
    const linkText = anchor.textContent?.trim() || "";
    if (!linkText) continue;
    const resolvedUrl = resolveUrl(href, url);
    const isExternal = !resolvedUrl.startsWith(window.location.origin);
    const selectors = generateStableSelector(anchor);
    links.push({
      id: `${url}#link-${links.length}`,
      url: resolvedUrl,
      headingText: linkText,
      headingId: `link-${links.length}`,
      breadcrumb: "",
      bodyText: linkText,
      type: isExternal ? "link" : "section",
      selector: selectors[0],
      selectors
    });
  }
  return links;
}
function extractFiles(html, url, extensions) {
  const files = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const fileExtensions = extensions?.split(",").map((e) => e.trim().toLowerCase()) ?? ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "csv"];
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (!href) continue;
    const isFile = fileExtensions.some(
      (ext) => href.toLowerCase().endsWith(`.${ext}`) || href.toLowerCase().endsWith(`.${ext}?`) || href.toLowerCase().endsWith(`.${ext}#`)
    );
    if (!isFile) continue;
    const linkText = anchor.textContent?.trim() || href.split("/").pop() || "";
    if (!linkText) continue;
    const resolvedUrl = resolveUrl(href, url);
    const selectors = generateStableSelector(anchor);
    files.push({
      id: `${url}#file-${files.length}`,
      url: resolvedUrl,
      headingText: linkText,
      headingId: `file-${files.length}`,
      breadcrumb: "",
      bodyText: linkText,
      type: "file",
      selector: selectors[0],
      selectors
    });
  }
  return files;
}
function extractMedia(html, url) {
  const media = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const images = Array.from(doc.querySelectorAll("img"));
  for (const img of images) {
    const alt = img.alt.trim();
    if (!alt) continue;
    let caption = "";
    const figure = img.closest("figure");
    if (figure) {
      const figcaption = figure.querySelector("figcaption");
      if (figcaption) {
        caption = figcaption.textContent?.trim() || "";
      }
    }
    const textToIndex = caption ? `${alt} ${caption}` : alt;
    if (!textToIndex.trim()) continue;
    const selectors = generateStableSelector(img);
    media.push({
      id: `${url}#media-image-${media.length}`,
      url,
      headingText: alt,
      headingId: `media-image-${media.length}`,
      breadcrumb: "",
      bodyText: textToIndex,
      type: "media",
      selector: selectors[0],
      selectors
    });
  }
  const mediaElements = Array.from(doc.querySelectorAll("video, audio"));
  for (const element of mediaElements) {
    const title = element.getAttribute("title") || element.getAttribute("aria-label") || "";
    if (!title) continue;
    let transcript = "";
    const tracks = Array.from(element.querySelectorAll('track[kind="captions"], track[kind="subtitles"]'));
    for (const track of tracks) {
      const src = track.getAttribute("src");
      if (src) {
        transcript += `[Transcript available: ${src}] `;
      }
    }
    const textToIndex = transcript ? `${title} ${transcript}` : title;
    if (!textToIndex.trim()) continue;
    const selectors = generateStableSelector(element);
    media.push({
      id: `${url}#media-${media.length}`,
      url,
      headingText: title,
      headingId: `media-${media.length}`,
      breadcrumb: "",
      bodyText: textToIndex,
      type: "media",
      selector: selectors[0],
      selectors,
      transcript: transcript.trim()
    });
  }
  return media;
}
function extractStructuredData(html, url) {
  const structured = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const jsonLdScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || "{}");
      if (Array.isArray(data) ? data.some((item) => item["@type"] === "FAQPage") : data["@type"] === "FAQPage") {
        const faqItems = Array.isArray(data) ? data.flatMap((item) => item.mainEntity || []) : data.mainEntity || [];
        for (const [index, question] of faqItems.entries()) {
          if (!question || !question.name) continue;
          const answer = question.acceptedAnswer?.text || question.suggestedAnswer?.text || "";
          if (!answer) continue;
          const textToIndex = `${question.name} ${answer}`;
          structured.push({
            id: `${url}#structured-faq-${index}`,
            url,
            headingText: question.name,
            headingId: `structured-faq-${index}`,
            breadcrumb: "",
            bodyText: textToIndex,
            type: "structured",
            structuredData: { question: question.name, answer }
          });
        }
      } else if (data["@type"]) {
        const type = data["@type"];
        const name = data.name || data.headline || "";
        const description = data.description || "";
        if (!name && !description) continue;
        const textToIndex = `${name} ${description}`.trim();
        if (!textToIndex) continue;
        structured.push({
          id: `${url}#structured-${type.toLowerCase()}-${structured.length}`,
          url,
          headingText: name || "Structured Data",
          headingId: `structured-${type.toLowerCase()}-${structured.length}`,
          breadcrumb: "",
          bodyText: textToIndex,
          type: "structured",
          structuredData: data
        });
      }
    } catch (e) {
      continue;
    }
  }
  return structured;
}
var TRACKING_PARAMS = /* @__PURE__ */ new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "mc_id",
  "referrer",
  "ref",
  "source",
  "campaign",
  "click_id"
]);
function stripTrackingParams(url) {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    for (const param of TRACKING_PARAMS) {
      params.delete(param);
    }
    for (const [key, value] of params.entries()) {
      if (!value) {
        params.delete(key);
      }
    }
    urlObj.search = params.toString();
    return urlObj.toString();
  } catch {
    return url;
  }
}
function normalizeUrl(url, html) {
  if (!url) return url;
  let normalized = url.replace(/\/$/, "");
  normalized = stripTrackingParams(normalized);
  if (html) {
    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    if (canonicalMatch?.[1]) {
      const canonicalUrl = stripTrackingParams(canonicalMatch[1]);
      if (canonicalUrl !== normalized) {
        return canonicalUrl.replace(/\/$/, "");
      }
    }
  }
  return normalized;
}
function resolveUrl(value, base) {
  if (!value) return base;
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

// ../src/indexing/indexer.ts
init_search_index();
var Indexer = class {
  constructor(config) {
    this.index = createSearchIndex();
    this.robotsCache = /* @__PURE__ */ new Map();
    this.lastCrawlTime = 0;
    this.config = config;
  }
  getIndex() {
    return this.index;
  }
  setIndex(index) {
    this.index = index;
  }
  extractAllContent(html, url) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (this.config.indexHidden) {
      extractHiddenContent(doc);
    }
    let rootElement = doc;
    if (this.config.scope) {
      const scopeElement = doc.querySelector(this.config.scope);
      if (scopeElement) {
        rootElement = scopeElement;
      }
    }
    const htmlToProcess = new XMLSerializer().serializeToString(rootElement);
    const sections = extractSections(htmlToProcess, url);
    const actions = this.config.indexActions ? extractActions(htmlToProcess, url, this.config.excludeAction) : [];
    const fields = this.config.indexActions ? extractFields(htmlToProcess, url) : [];
    const links = extractLinks(htmlToProcess, url);
    const files = extractFiles(htmlToProcess, url, this.config.fileExtensions);
    const media = this.config.indexMedia ? extractMedia(htmlToProcess, url) : [];
    const structured = this.config.indexStructuredData ? extractStructuredData(htmlToProcess, url) : [];
    const combined = [];
    combined.push(...sections, ...actions, ...fields, ...links, ...files, ...media, ...structured);
    return combined;
  }
  async boot(onReady, showToast) {
    if (this.config.prebuiltIndexUrl) {
      try {
        const response = await fetch(this.config.prebuiltIndexUrl);
        if (response.ok) {
          const json = await response.text();
          this.index = (await Promise.resolve().then(() => (init_search_index(), search_index_exports))).deserializeIndex(json);
          console.info(`[reef] loaded prebuilt index with ${this.index.allSections.length} sections`);
          onReady();
          return;
        }
      } catch (error) {
        console.warn("[reef] prebuilt index fetch failed, falling back to crawling", error);
      }
    }
    try {
      const { loadIndex: loadIndex2, saveIndex: saveIndex2 } = await Promise.resolve().then(() => (init_cache(), cache_exports));
      const ttl = this.config.ttl;
      const cached = await loadIndex2(ttl);
      if (cached?.index && cached.index.allSections.length > 0) {
        this.index = cached.index;
        console.info(`[reef] loaded cached index with ${this.index.allSections.length} sections`);
        onReady();
        return;
      }
    } catch (error) {
      console.warn("[reef] cache load failed, continuing with fresh index", error);
    }
    let cachedMetadata = null;
    try {
      const { loadIndex: loadIndex2 } = await Promise.resolve().then(() => (init_cache(), cache_exports));
      cachedMetadata = await loadIndex2();
    } catch (e) {
      console.warn("[reef] failed to load cached metadata for incremental crawling", e);
    }
    const pageHashes = cachedMetadata?.metadata?.pageMetadata ?? {};
    const urls = await this.fetchSitemapUrls();
    const maxPages = this.config.maxPages ?? 500;
    if (urls.length === 0) {
      this.crawlSameOrigin(onReady);
      return;
    }
    if (this.config.useWorkerIndexing) {
      await this.fetchPagesWithWorker(urls.slice(0, maxPages), urls[0], onReady);
    } else {
      const fetchedSections = await this.fetchPagesParallel(urls.slice(0, maxPages), urls[0], pageHashes);
      if (fetchedSections.length) {
        addToIndex(this.index, fetchedSections, this.config.tokenizePipeline);
        console.info(`[reef] indexed ${fetchedSections.length} sections`);
      }
      try {
        const { saveIndex: saveIndex2 } = await Promise.resolve().then(() => (init_cache(), cache_exports));
        const versionHash = this.computeVersionHash(urls);
        const newPageMetadata = {};
        for (const url of urls.slice(0, maxPages)) {
          newPageMetadata[url] = pageHashes[url] ?? { timestamp: Date.now() };
        }
        const metadata = {
          versionHash,
          buildTime: Date.now(),
          pageMetadata: newPageMetadata
        };
        await saveIndex2(this.index, metadata);
      } catch (e) {
        console.warn("[reef] cache save failed", e);
      }
      onReady();
      return;
    }
    this.crawlSameOrigin(onReady);
  }
  async fetchSitemapUrls() {
    const candidates = this.getSitemapCandidates();
    const allUrls = [];
    const seenUrls = /* @__PURE__ */ new Set();
    for (const candidate of candidates) {
      try {
        await this.processSitemap(candidate, allUrls, seenUrls);
      } catch (e) {
        console.warn("[reef] failed to process sitemap:", candidate, e);
        continue;
      }
    }
    return allUrls;
  }
  async processSitemap(url, allUrls, seenUrls) {
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const xml = await response.text();
      const isSitemapIndex = xml.includes("<sitemapindex") && xml.includes("</sitemapindex>");
      if (isSitemapIndex) {
        const sitemapRegex = /<sitemap>\s*<loc>(.*?)<\/loc>\s*<\/sitemap>/g;
        let match;
        while ((match = sitemapRegex.exec(xml)) !== null) {
          const childSitemapUrl = match[1].trim();
          const resolvedUrl = this.resolveUrl(childSitemapUrl, url);
          await this.processSitemap(resolvedUrl, allUrls, seenUrls);
        }
      } else {
        const locRegex = /<loc>(.*?)<\/loc>/g;
        let match;
        while ((match = locRegex.exec(xml)) !== null) {
          const pageUrl = match[1].trim();
          const resolvedUrl = this.resolveUrl(pageUrl, url);
          if (!seenUrls.has(resolvedUrl)) {
            allUrls.push(resolvedUrl);
            seenUrls.add(resolvedUrl);
          }
        }
      }
    } catch (e) {
      console.warn("[reef] failed to process sitemap:", url, e);
    }
  }
  computeVersionHash(urls) {
    let hash = 0;
    for (const url of urls) {
      for (let i = 0; i < url.length; i++) {
        const char = url.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
    }
    return Math.abs(hash).toString(36);
  }
  // Simple hash function for content hashing
  hashContent(content) {
    let hash = 0;
    for (let i = 0; i < Math.min(content.length, 1e4); i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
  getSitemapCandidates() {
    const base = window.location.href;
    const configured = this.config.sitemap ?? "sitemap.xml";
    const candidates = [this.resolveUrl(configured, base)];
    if (!configured.startsWith("/")) {
      candidates.push(this.resolveUrl("./sitemap.xml", base));
    } else if (configured === "/sitemap.xml") {
      candidates.push(this.resolveUrl("sitemap.xml", base));
    }
    return [...new Set(candidates)];
  }
  resolveUrl(value, base) {
    if (!value) return base;
    try {
      return new URL(value, base).toString();
    } catch {
      return value;
    }
  }
  // Fetch and parse robots.txt for a given origin
  async fetchRobotsTxt(origin) {
    const cacheKey = origin;
    const cacheEntry = this.robotsCache.get(cacheKey);
    if (cacheEntry && Date.now() - cacheEntry.timestamp < 36e5) {
      return cacheEntry.disallowed;
    }
    try {
      const robotsUrl = new URL("/robots.txt", origin).toString();
      const response = await fetch(robotsUrl);
      if (!response.ok) {
        this.robotsCache.set(cacheKey, { disallowed: /* @__PURE__ */ new Set(), timestamp: Date.now() });
        return /* @__PURE__ */ new Set();
      }
      const robotsText = await response.text();
      const disallowed = this.parseRobotsTxt(robotsText);
      this.robotsCache.set(cacheKey, { disallowed, timestamp: Date.now() });
      return disallowed;
    } catch (e) {
      console.warn("[reef] failed to fetch robots.txt:", e);
      this.robotsCache.set(cacheKey, { disallowed: /* @__PURE__ */ new Set(), timestamp: Date.now() });
      return /* @__PURE__ */ new Set();
    }
  }
  // Parse robots.txt content and extract disallowed paths
  parseRobotsTxt(robotsText) {
    const disallowed = /* @__PURE__ */ new Set();
    const lines = robotsText.split("\n");
    let currentUserAgent = "";
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) continue;
      const userAgentMatch = trimmedLine.match(/^User-agent:\s*(.+)$/i);
      if (userAgentMatch) {
        currentUserAgent = userAgentMatch[1].trim();
        continue;
      }
      const disallowMatch = trimmedLine.match(/^Disallow:\s*(.+)$/i);
      if (disallowMatch && currentUserAgent === "*") {
        const path = disallowMatch[1].trim();
        if (path) {
          disallowed.add(path);
        }
      }
    }
    return disallowed;
  }
  // Check if a URL is allowed by robots.txt
  isUrlAllowed(url, origin) {
    const cacheEntry = this.robotsCache.get(origin);
    if (!cacheEntry) return true;
    const disallowed = cacheEntry.disallowed;
    if (disallowed.size === 0) return true;
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      for (const disallowedPath of disallowed) {
        if (path.startsWith(disallowedPath)) {
          return false;
        }
      }
    } catch {
      return true;
    }
    return true;
  }
  // Apply crawl delay between batches
  async applyCrawlDelay() {
    const delay = this.config.crawlDelay ?? 0;
    if (delay <= 0) return;
    const now = Date.now();
    const timeSinceLastCrawl = now - this.lastCrawlTime;
    if (timeSinceLastCrawl < delay) {
      await new Promise((resolve) => setTimeout(resolve, delay - timeSinceLastCrawl));
    }
    this.lastCrawlTime = Date.now();
  }
  crawlSameOrigin(onReady) {
    const origin = window.location.origin;
    const visited = /* @__PURE__ */ new Set();
    const queue = [normalizeUrl(window.location.href)];
    const maxPages = this.config.maxPages ?? 500;
    const concurrency = this.config.maxPages ? Math.min(this.config.maxPages, 6) : 6;
    const processQueue = async () => {
      await this.fetchRobotsTxt(origin);
      while (queue.length && visited.size < maxPages) {
        await this.applyCrawlDelay();
        const batch = queue.splice(0, concurrency);
        for (const url of batch) {
          const normalizedUrlStr = normalizeUrl(url);
          if (visited.has(normalizedUrlStr) || !normalizedUrlStr.startsWith(origin)) continue;
          if (!this.isUrlAllowed(normalizedUrlStr, origin)) {
            console.info(`[reef] skipping disallowed URL: ${normalizedUrlStr}`);
            continue;
          }
          visited.add(normalizedUrlStr);
          try {
            const response = await fetch(normalizedUrlStr);
            if (!response.ok) continue;
            const html = await response.text();
            const content = this.extractAllContent(html, normalizedUrlStr);
            addToIndex(this.index, content, this.config.tokenizePipeline);
            const links = extractLinks(html, normalizedUrlStr).filter((l) => l.url.startsWith(origin)).map((l) => normalizeUrl(l.url)).filter((u, i, arr) => arr.indexOf(u) === i);
            queue.push(...links);
          } catch (e) {
            continue;
          }
        }
      }
      console.info(`[reef] indexed ${visited.size} pages via same-origin crawl`);
      onReady();
    };
    processQueue();
  }
  async fetchPagesParallel(urls, sitemapUrl, pageHashes = {}) {
    const concurrency = 6;
    const sections = [];
    const results = new Array(urls.length);
    let idx = 0;
    const fetchBatch = async () => {
      while (idx < urls.length) {
        const i = idx++;
        const pageUrl = this.resolveUrl(urls[i], sitemapUrl);
        try {
          const cachedPageInfo = pageHashes[pageUrl];
          if (cachedPageInfo) {
            const headResponse = await fetch(pageUrl, { method: "HEAD" });
            if (headResponse.ok) {
              const currentEtag = headResponse.headers.get("ETag");
              const currentLastModified = headResponse.headers.get("Last-Modified");
              if (cachedPageInfo.etag && currentEtag === cachedPageInfo.etag || cachedPageInfo.lastModified && currentLastModified === cachedPageInfo.lastModified) {
                console.info(`[reef] skipping unchanged page: ${pageUrl}`);
                results[i] = null;
                return;
              }
            }
          }
          const pageResponse = await fetch(pageUrl);
          if (pageResponse.ok) {
            const html = await pageResponse.text();
            if (cachedPageInfo?.contentHash) {
              const currentContentHash = this.hashContent(html);
              if (currentContentHash === cachedPageInfo.contentHash) {
                console.info(`[reef] skipping unchanged page (content hash match): ${pageUrl}`);
                results[i] = null;
                return;
              }
            }
            const pageSections = this.extractAllContent(html, pageUrl);
            results[i] = pageSections;
            pageHashes[pageUrl] = {
              etag: pageResponse.headers.get("ETag"),
              lastModified: pageResponse.headers.get("Last-Modified"),
              contentHash: this.hashContent(html),
              timestamp: Date.now()
            };
          }
        } catch {
          results[i] = null;
        }
      }
    };
    await Promise.all([...Array(concurrency)].map(() => fetchBatch()));
    for (let i = 0; i < results.length; i++) {
      if (results[i]) {
        sections.push(...results[i] ?? []);
      }
    }
    return sections;
  }
  async fetchPagesWithWorker(urls, sitemapUrl, onReady) {
    const workerUrl = new URL("../worker.js", import.meta.url).href;
    const workerCount = Math.min(navigator.hardwareConcurrency || 4, 4);
    return new Promise((resolve, reject) => {
      const workers = [];
      const results = /* @__PURE__ */ new Map();
      let completedWorkers = 0;
      const shards = this.shardArray(urls, workerCount);
      for (let i = 0; i < workerCount; i++) {
        const worker = new Worker(workerUrl);
        workers.push(worker);
        const workerId = i;
        const shard = shards[i] || [];
        const messageHandler = (e) => {
          const { result, error, json, workerIndex } = e.data;
          if (workerIndex !== workerId) return;
          if (error) {
            console.error(`[reef] worker ${workerId} error:`, error);
            results.set(workerId, { result: "error", error });
          } else if (json) {
            results.set(workerId, { result: "ok", error: "" });
          }
          completedWorkers++;
          if (completedWorkers === workerCount) {
            this.mergeWorkerResults(workers, results, onReady, resolve, reject);
          }
        };
        const errorHandler = (e) => {
          console.error(`[reef] worker ${workerId} error:`, e.error);
          results.set(workerId, { result: "error", error: e.error?.toString() || "Unknown error" });
          completedWorkers++;
          if (completedWorkers === workerCount) {
            this.mergeWorkerResults(workers, results, onReady, resolve, reject);
          }
        };
        worker.addEventListener("message", messageHandler);
        worker.addEventListener("error", errorHandler);
        const config = {
          scope: this.config.scope,
          indexActions: this.config.indexActions,
          indexMedia: this.config.indexMedia,
          indexStructuredData: this.config.indexStructuredData,
          indexHidden: this.config.indexHidden,
          excludeAction: this.config.excludeAction,
          fileExtensions: this.config.fileExtensions
        };
        const id = Date.now() + i;
        worker.postMessage({
          id,
          workerIndex: i,
          action: "indexPages",
          payload: {
            pages: shard.map((url) => [this.resolveUrl(url, sitemapUrl), ""]),
            // URL and empty HTML initially
            config,
            shardIndex: i,
            totalShards: workerCount
          }
        });
      }
    });
  }
  // Helper to shard an array into N parts
  shardArray(array, count) {
    const shards = [];
    const shardSize = Math.ceil(array.length / count);
    for (let i = 0; i < count; i++) {
      const start = i * shardSize;
      const end = start + shardSize;
      shards.push(array.slice(start, end));
    }
    return shards;
  }
  // Merge results from all workers
  async mergeWorkerResults(workers, results, onReady, resolve, reject) {
    for (const worker of workers) {
      worker.terminate();
    }
    let hasErrors = false;
    for (const [workerId, result] of results) {
      if (result.error) {
        hasErrors = true;
        break;
      }
    }
    if (hasErrors) {
      console.warn("[reef] worker pool had errors, falling back to single-threaded");
      try {
        const fetchedSections = await this.fetchPagesParallel(
          Array.from(results.keys()).map((i) => this.resolveUrl("", "")),
          // Empty for fallback
          "",
          {}
        );
        onReady();
        resolve(fetchedSections);
      } catch (e) {
        reject(e);
      }
      return;
    }
    console.warn("[reef] worker pool: TODO implement proper merging of worker results");
    onReady();
    resolve([]);
  }
};

// src/storage.ts
var KEY = {
  bookmarks: "reef.bookmarks",
  snippets: "reef.snippets",
  pageNotes: "reef.pageNotes",
  recents: "reef.recents"
};
function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function storageApi() {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    return chrome.storage.local;
  }
  return null;
}
async function getArray(key) {
  const api = storageApi();
  if (!api) return [];
  const data = await api.get([key]);
  return data[key] || [];
}
async function setArray(key, value) {
  const api = storageApi();
  if (!api) return;
  await api.set({ [key]: value });
}
async function listBookmarks(query = "", tags = []) {
  const all = await getArray(KEY.bookmarks);
  return filterItems(all, query, tags);
}
async function createBookmark(input) {
  const now = Date.now();
  const bookmark = { ...input, id: genId(), createdAt: now, updatedAt: now };
  const all = await getArray(KEY.bookmarks);
  all.unshift(bookmark);
  await setArray(KEY.bookmarks, all);
  return bookmark;
}
async function updateBookmark(id, patch) {
  const all = await getArray(KEY.bookmarks);
  const idx = all.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, id, updatedAt: Date.now() };
  await setArray(KEY.bookmarks, all);
  return all[idx];
}
async function deleteBookmark(id) {
  const all = await getArray(KEY.bookmarks);
  const next = all.filter((b) => b.id !== id);
  if (next.length === all.length) return false;
  await setArray(KEY.bookmarks, next);
  return true;
}
async function listSnippets(query = "", tags = []) {
  const all = await getArray(KEY.snippets);
  return filterItems(all, query, tags);
}
async function createSnippet(input) {
  const now = Date.now();
  const snippet = { ...input, id: genId(), createdAt: now, updatedAt: now };
  const all = await getArray(KEY.snippets);
  all.unshift(snippet);
  await setArray(KEY.snippets, all);
  return snippet;
}
async function updateSnippet(id, patch) {
  const all = await getArray(KEY.snippets);
  const idx = all.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, id, updatedAt: Date.now() };
  await setArray(KEY.snippets, all);
  return all[idx];
}
async function deleteSnippet(id) {
  const all = await getArray(KEY.snippets);
  const next = all.filter((s) => s.id !== id);
  if (next.length === all.length) return false;
  await setArray(KEY.snippets, next);
  return true;
}
async function getPageNote(url) {
  const all = await getArray(KEY.pageNotes);
  return all.find((n) => n.url === url) || null;
}
async function listPageNotes(query = "") {
  const all = await getArray(KEY.pageNotes);
  if (!query) return all;
  const q = query.toLowerCase();
  return all.filter(
    (n) => n.text.toLowerCase().includes(q) || n.title.toLowerCase().includes(q) || n.url.toLowerCase().includes(q)
  );
}
async function setPageNote(url, text, title) {
  const all = await getArray(KEY.pageNotes);
  const existing = all.findIndex((n) => n.url === url);
  const note = { url, text, title, updatedAt: Date.now() };
  if (existing >= 0) all[existing] = note;
  else all.unshift(note);
  await setArray(KEY.pageNotes, all);
  return note;
}
async function deletePageNote(url) {
  const all = await getArray(KEY.pageNotes);
  const next = all.filter((n) => n.url !== url);
  if (next.length === all.length) return false;
  await setArray(KEY.pageNotes, next);
  return true;
}
var RECENT_MAX = 30;
async function listRecents() {
  return getArray(KEY.recents);
}
async function recordRecent(page) {
  const all = await getArray(KEY.recents);
  const next = [{ ...page, visitedAt: Date.now() }, ...all.filter((p) => p.url !== page.url)].slice(0, RECENT_MAX);
  await setArray(KEY.recents, next);
}
async function clearRecents() {
  await setArray(KEY.recents, []);
}
async function allBookmarkTags() {
  return collectTags(await getArray(KEY.bookmarks));
}
async function allSnippetTags() {
  return collectTags(await getArray(KEY.snippets));
}
function filterItems(items, query, tags) {
  let out = items;
  if (tags.length) {
    out = out.filter((item) => tags.every((t) => item.tags.includes(t)));
  }
  if (query) {
    const q = query.toLowerCase();
    out = out.filter((item) => {
      const hay = JSON.stringify(item).toLowerCase();
      return hay.includes(q);
    });
  }
  return out;
}
function collectTags(items) {
  const set = /* @__PURE__ */ new Set();
  for (const item of items) for (const tag of item.tags) set.add(tag);
  return Array.from(set).sort();
}

// src/background.ts
var tabIndices = /* @__PURE__ */ new Map();
var siteIndices = /* @__PURE__ */ new Map();
async function getOptions() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return {
      actionsMode: "execute",
      allowDenyList: [],
      exclusionSelectors: [],
      telemetryEnabled: false,
      enableCrossTabCrawl: false
    };
  }
  const data = await chrome.storage.local.get([
    "actionsMode",
    "allowDenyList",
    "exclusionSelectors",
    "telemetryEnabled",
    "enableCrossTabCrawl"
  ]);
  return {
    actionsMode: data.actionsMode || "execute",
    allowDenyList: data.allowDenyList || [],
    exclusionSelectors: data.exclusionSelectors || [],
    telemetryEnabled: data.telemetryEnabled || false,
    enableCrossTabCrawl: data.enableCrossTabCrawl || false
  };
}
async function getOrFetchTabIndex(tabId, forceRefresh = false) {
  if (!forceRefresh && tabIndices.has(tabId)) {
    return tabIndices.get(tabId);
  }
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "GET_MANIFEST" });
    if (response && response.success && response.manifest) {
      const index = createSearchIndex();
      addToIndex(index, response.manifest.records);
      const state = {
        index,
        manifest: response.manifest,
        lastUpdated: Date.now()
      };
      tabIndices.set(tabId, state);
      const options = await getOptions();
      if (options.enableCrossTabCrawl && response.manifest.url) {
        try {
          const urlObj = new URL(response.manifest.url);
          const origin = urlObj.origin;
          let siteIndex = siteIndices.get(origin);
          if (!siteIndex) {
            siteIndex = createSearchIndex();
            siteIndices.set(origin, siteIndex);
          }
          addToIndex(siteIndex, response.manifest.records);
        } catch {
        }
      }
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url && tab.title) {
          await recordRecent({
            url: tab.url,
            title: tab.title,
            favicon: tab.favIconUrl,
            recordCount: response.manifest.records.length
          });
        }
      } catch {
      }
      return state;
    }
  } catch (err) {
    console.warn(`[Reef Background] Failed to fetch manifest from tab ${tabId}:`, err);
  }
  return null;
}
function ensureContextMenus() {
  if (typeof chrome === "undefined" || !chrome.contextMenus) return;
  const api = chrome.contextMenus;
  if (!api) return;
  const create = (id, title, contexts) => {
    try {
      api.create({ id, title, contexts }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
    }
  };
  create("reef-bookmark-selection", "Bookmark selection in Reef", ["selection"]);
  create("reef-snippet-selection", "Save selection as snippet", ["selection"]);
  create("reef-search-selection", 'Search "%s" in Reef', ["selection"]);
  create("reef-note-page", "Add note to this page", ["page", "selection"]);
  create("reef-bookmark-page", "Bookmark this page in Reef", ["page"]);
}
if (typeof chrome !== "undefined") {
  if (chrome.runtime?.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => ensureContextMenus());
  }
  if (chrome.runtime?.onStartup) {
    chrome.runtime.onStartup.addListener(() => ensureContextMenus());
  }
  ensureContextMenus();
}
if (typeof chrome !== "undefined" && chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
      if (info.menuItemId === "reef-bookmark-selection" && info.selectionText && tab?.id !== void 0) {
        await chrome.tabs.sendMessage(tab.id, { type: "REEF_BOOKMARK_SELECTION", text: info.selectionText });
        return;
      }
      if (info.menuItemId === "reef-snippet-selection" && info.selectionText && tab?.id !== void 0) {
        await chrome.tabs.sendMessage(tab.id, { type: "REEF_SNIPPET_SELECTION", text: info.selectionText });
        return;
      }
      if (info.menuItemId === "reef-search-selection" && info.selectionText && tab?.id !== void 0) {
        await chrome.tabs.sendMessage(tab.id, { type: "REEF_OPEN_POPUP_QUERY", query: info.selectionText });
        chrome.action?.openPopup?.();
        return;
      }
      if (info.menuItemId === "reef-note-page" && tab?.id !== void 0) {
        await chrome.tabs.sendMessage(tab.id, { type: "REEF_OPEN_NOTE_FOR_PAGE" });
        chrome.action?.openPopup?.();
        return;
      }
      if (info.menuItemId === "reef-bookmark-page" && tab?.id !== void 0) {
        await chrome.tabs.sendMessage(tab.id, { type: "REEF_BOOKMARK_PAGE" });
        return;
      }
    } catch (err) {
      console.warn("[Reef Background] Context menu action failed:", err);
    }
  });
}
if (typeof chrome !== "undefined" && chrome.omnibox) {
  chrome.omnibox.onInputChanged.addListener(async (text, suggestCallback) => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return;
    const state = await getOrFetchTabIndex(activeTab.id);
    if (!state) return;
    const results = searchSections(text, state.index, { limit: 5 });
    const suggestions = results.map((r) => ({
      content: r.url || r.headingText,
      description: `<match>${escapeXml(r.headingText)}</match> - ${escapeXml(r.bodyText?.slice(0, 60) || "")}`
    }));
    suggestCallback(suggestions);
  });
  chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return;
    const state = await getOrFetchTabIndex(activeTab.id);
    if (!state) return;
    const results = searchSections(text, state.index, { limit: 1 });
    if (results.length > 0) {
      const record = results[0];
      await chrome.tabs.sendMessage(activeTab.id, {
        type: "EXECUTE_ACTION",
        record,
        actionType: record.type === "field" ? "type" : "click"
      });
    }
  });
}
function escapeXml(str) {
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function scoreTitle(title, q) {
  if (!q) return 0;
  const t = title.toLowerCase();
  if (t === q) return 60;
  if (t.startsWith(q)) return 35;
  const idx = t.indexOf(q);
  if (idx >= 0) return 15 + Math.max(0, 10 - Math.floor(idx / 8));
  if (new RegExp(`\\b${escapeRegex(q)}`, "i").test(title)) return 12;
  return 0;
}
function searchSiteContent(query, limit = 10) {
  const results = [];
  for (const [origin, index] of siteIndices) {
    try {
      const hits = searchSections(query, index, { limit: 3, fuzzy: true });
      for (const hit of hits) {
        results.push({
          url: hit.url || origin,
          headingText: hit.headingText,
          bodyText: (hit.bodyText || "").slice(0, 120),
          selector: hit.selector,
          type: hit.type,
          score: 5,
          sourceOrigin: origin
        });
      }
    } catch {
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
function looksLikeUrl(q) {
  return /^(https?:\/\/|www\.)/i.test(q) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(q) && q.includes(".");
}
async function searchOpenTabs(query, limit = 25) {
  if (!query.trim() || typeof chrome === "undefined" || !chrome.tabs) return { items: [] };
  const q = query.toLowerCase();
  const tabs = await chrome.tabs.query({});
  let currentWindowId;
  try {
    const [cw] = await chrome.windows.getCurrent();
    currentWindowId = cw?.id;
  } catch {
  }
  const fetchPromises = [];
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !tab.title) continue;
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("about:") || tab.url.startsWith("moz-extension:")) continue;
    if (!tabIndices.has(tab.id)) {
      fetchPromises.push(
        getOrFetchTabIndex(tab.id).then(() => {
        })
      );
    }
  }
  if (fetchPromises.length > 0) {
    await Promise.race([
      Promise.allSettled(fetchPromises),
      new Promise((resolve) => setTimeout(resolve, 3e3))
    ]);
  }
  const matches = [];
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !tab.title) continue;
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("about:") || tab.url.startsWith("moz-extension:")) continue;
    let score = 0;
    const matchedRecords = [];
    const title = tab.title;
    const url = tab.url;
    score += scoreTitle(title, q);
    if (url.toLowerCase().includes(q)) score += 5;
    if (typeof currentWindowId === "number" && tab.windowId === currentWindowId) score += 3;
    const state = tabIndices.get(tab.id);
    if (state) {
      try {
        const hits = searchSections(query, state.index, { limit: 3, fuzzy: true });
        if (hits.length) {
          score += 8;
          matchedRecords.push(...hits);
        }
      } catch {
      }
    } else if (score === 0) {
      continue;
    }
    if (score > 0) {
      matches.push({ tab, score, matchedRecords });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  let items = matches.slice(0, limit).map((m) => ({
    tabId: m.tab.id,
    title: m.tab.title,
    url: m.tab.url,
    favIconUrl: m.tab.favIconUrl,
    windowId: m.tab.windowId,
    score: m.score,
    matchedRecords: m.matchedRecords.map((r) => ({
      headingText: r.headingText,
      bodyText: (r.bodyText || "").slice(0, 120),
      selector: r.selector,
      type: r.type
    }))
  }));
  let suggestion;
  for (const [, state] of tabIndices) {
    const word = findClosestWord(query, state.index, 2);
    if (word && word !== query.toLowerCase()) {
      suggestion = word;
      break;
    }
  }
  let autocorrected = false;
  if (items.length === 0 && suggestion) {
    const correctedMatches = [];
    for (const tab of tabs) {
      if (!tab.id || !tab.url || !tab.title) continue;
      if (tab.url.startsWith("chrome://") || tab.url.startsWith("about:") || tab.url.startsWith("moz-extension:")) continue;
      const state = tabIndices.get(tab.id);
      if (!state) continue;
      try {
        const hits = searchSections(suggestion, state.index, { limit: 3, fuzzy: true });
        if (hits.length) {
          correctedMatches.push({ tab, score: 6 + hits.length, matchedRecords: hits });
        }
      } catch {
      }
    }
    if (correctedMatches.length > 0) {
      correctedMatches.sort((a, b) => b.score - a.score);
      items = correctedMatches.slice(0, limit).map((m) => ({
        tabId: m.tab.id,
        title: m.tab.title,
        url: m.tab.url,
        favIconUrl: m.tab.favIconUrl,
        windowId: m.tab.windowId,
        score: m.score,
        matchedRecords: m.matchedRecords.map((r) => ({
          headingText: r.headingText,
          bodyText: (r.bodyText || "").slice(0, 120),
          selector: r.selector,
          type: r.type
        }))
      }));
      autocorrected = true;
    }
  }
  if (items.length === 0) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        const reefResponse = await chrome.tabs.sendMessage(activeTab.id, {
          type: "REEF_LOCAL_SEARCH",
          query,
          options: { limit: 5 }
        });
        if (reefResponse?.success && reefResponse.results?.length > 0) {
          if (!suggestion && reefResponse.suggestion) suggestion = reefResponse.suggestion;
          if (reefResponse.autocorrected) {
            items = reefResponse.results.slice(0, 5).map((r) => ({
              tabId: activeTab.id,
              title: activeTab.title || "",
              url: activeTab.url || "",
              favIconUrl: activeTab.favIconUrl || "",
              windowId: activeTab.windowId,
              score: 5,
              matchedRecords: [{ headingText: r.headingText, bodyText: (r.bodyText || "").slice(0, 120), selector: r.selector, type: r.type }]
            }));
            autocorrected = true;
          }
        }
      }
    } catch {
    }
  }
  const siteResults = searchSiteContent(query, 5);
  const actions = [];
  if (looksLikeUrl(query.trim())) {
    let navUrl = query.trim();
    if (!/^https?:\/\//i.test(navUrl)) navUrl = "https://" + navUrl;
    actions.push({ type: "open-url", title: `Open ${navUrl}`, url: navUrl });
  }
  actions.push({ type: "search-web", title: `Search the web for "${query}"`, url: `https://www.google.com/search?q=${encodeURIComponent(query)}` });
  return { items, suggestion, autocorrected, siteResults, actions };
}
async function listOpenTabs() {
  if (typeof chrome === "undefined" || !chrome.tabs) return { items: [] };
  const tabs = await chrome.tabs.query({});
  const items = [];
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !tab.title) continue;
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("about:") || tab.url.startsWith("moz-extension:")) continue;
    items.push({
      tabId: tab.id,
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl || "",
      windowId: tab.windowId,
      score: 0,
      matchedRecords: []
    });
  }
  return { items };
}
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        if (message.type === "SEARCH_CURRENT_TAB") {
          const tabId = message.tabId || sender.tab?.id;
          if (!tabId) {
            sendResponse({ success: false, error: "no-tab-id" });
            return;
          }
          const state = await getOrFetchTabIndex(tabId, message.forceRefresh);
          if (!state) {
            sendResponse({ success: false, error: "failed-to-index-tab" });
            return;
          }
          const options = message.searchOptions || {};
          const query = message.query || "";
          const paginated = searchWithPagination(query, state.index, options);
          const bgSuggestions = suggest(query, state.index);
          let results = paginated.results.map((sr) => sr.record ?? sr);
          let suggestion;
          let autocorrected = false;
          let reefSuggestions = [];
          try {
            const reefResponse = await chrome.tabs.sendMessage(tabId, {
              type: "REEF_LOCAL_SEARCH",
              query,
              options: { limit: options.pageSize ?? 20 }
            });
            if (reefResponse?.success) {
              reefSuggestions = reefResponse.suggestions || [];
              if (results.length === 0 && reefResponse.autocorrected && reefResponse.results?.length > 0) {
                results = reefResponse.results;
                suggestion = reefResponse.suggestion;
                autocorrected = true;
              }
              if (!suggestion && reefResponse.suggestion) {
                suggestion = reefResponse.suggestion;
              }
            }
          } catch {
          }
          const mergedSuggestions = [...new Set([...bgSuggestions, ...reefSuggestions])].slice(0, 10);
          sendResponse({
            success: true,
            results,
            total: paginated.total,
            hasMore: paginated.hasMore,
            suggestions: mergedSuggestions,
            suggestion,
            autocorrected,
            manifest: state.manifest
          });
          return;
        }
        if (message.type === "EXECUTE_TAB_ACTION") {
          const tabId = message.tabId || sender.tab?.id;
          if (!tabId) {
            sendResponse({ success: false, error: "no-tab-id" });
            return;
          }
          const opts = await getOptions();
          const response = await chrome.tabs.sendMessage(tabId, {
            type: "EXECUTE_ACTION",
            record: message.record,
            actionType: message.actionType,
            value: message.value,
            options: {
              actionsMode: opts.actionsMode,
              exclusionSelectors: opts.exclusionSelectors
            }
          });
          sendResponse(response);
          return;
        }
        if (message.type === "CRAWL_SITE_CROSS_TAB") {
          const tabId = message.tabId || sender.tab?.id;
          if (!tabId) {
            sendResponse({ success: false, error: "no-tab-id" });
            return;
          }
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.url) {
            sendResponse({ success: false, error: "no-tab-url" });
            return;
          }
          const indexer = new Indexer({ scope: "body", indexActions: true });
          await indexer.crawlSameOrigin(() => {
            const crawledIndex = indexer.getIndex();
            siteIndices.set(new URL(tab.url).origin, crawledIndex);
            sendResponse({ success: true });
          });
          return;
        }
        if (message.type === "LIBRARY_BOOKMARK_LIST") {
          sendResponse({ success: true, items: await listBookmarks(message.query || "", message.tags || []) });
          return;
        }
        if (message.type === "LIBRARY_BOOKMARK_CREATE") {
          const bookmark = await createBookmark(message.data);
          sendResponse({ success: true, item: bookmark });
          return;
        }
        if (message.type === "LIBRARY_BOOKMARK_UPDATE") {
          const item = await updateBookmark(message.id, message.data || {});
          sendResponse({ success: !!item, item });
          return;
        }
        if (message.type === "LIBRARY_BOOKMARK_DELETE") {
          sendResponse({ success: await deleteBookmark(message.id) });
          return;
        }
        if (message.type === "LIBRARY_SNIPPET_LIST") {
          sendResponse({ success: true, items: await listSnippets(message.query || "", message.tags || []) });
          return;
        }
        if (message.type === "LIBRARY_SNIPPET_CREATE") {
          const snippet = await createSnippet(message.data);
          sendResponse({ success: true, item: snippet });
          return;
        }
        if (message.type === "LIBRARY_SNIPPET_UPDATE") {
          const item = await updateSnippet(message.id, message.data || {});
          sendResponse({ success: !!item, item });
          return;
        }
        if (message.type === "LIBRARY_SNIPPET_DELETE") {
          sendResponse({ success: await deleteSnippet(message.id) });
          return;
        }
        if (message.type === "LIBRARY_NOTE_GET") {
          sendResponse({ success: true, item: await getPageNote(message.url) });
          return;
        }
        if (message.type === "LIBRARY_NOTE_LIST") {
          sendResponse({ success: true, items: await listPageNotes(message.query || "") });
          return;
        }
        if (message.type === "LIBRARY_NOTE_SET") {
          const note = await setPageNote(message.url, message.text, message.title || "");
          sendResponse({ success: true, item: note });
          return;
        }
        if (message.type === "LIBRARY_NOTE_DELETE") {
          sendResponse({ success: await deletePageNote(message.url) });
          return;
        }
        if (message.type === "LIBRARY_RECENTS_LIST") {
          sendResponse({ success: true, items: await listRecents() });
          return;
        }
        if (message.type === "LIBRARY_RECENTS_CLEAR") {
          await clearRecents();
          sendResponse({ success: true });
          return;
        }
        if (message.type === "LIBRARY_TAGS") {
          sendResponse({
            success: true,
            bookmarkTags: await allBookmarkTags(),
            snippetTags: await allSnippetTags()
          });
          return;
        }
        if (message.type === "TAB_SEARCH" || message.type === "SPOTLIGHT_SEARCH") {
          const result = await searchOpenTabs(message.query || "", message.limit || 50);
          sendResponse({
            success: true,
            items: result.items,
            suggestion: result.suggestion,
            autocorrected: result.autocorrected,
            siteResults: result.siteResults,
            actions: result.actions
          });
          return;
        }
        if (message.type === "TAB_SWITCH") {
          if (typeof message.tabId === "number" && chrome.tabs) {
            await chrome.tabs.update(message.tabId, { active: true });
            if (typeof message.windowId === "number" && chrome.windows) {
              await chrome.windows.update(message.windowId, { focused: true });
            }
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: "invalid-tab-id" });
          }
          return;
        }
        if (message.type === "SPOTLIGHT_OPEN_RECORD") {
          if (typeof message.tabId === "number" && message.record && chrome.tabs) {
            try {
              await chrome.tabs.sendMessage(message.tabId, {
                type: "HIGHLIGHT_RECORD",
                record: message.record
              });
              sendResponse({ success: true });
            } catch {
              sendResponse({ success: false, error: "failed-to-highlight" });
            }
          } else {
            sendResponse({ success: false, error: "invalid-spotlight-open-record" });
          }
          return;
        }
        if (message.type === "SPOTLIGHT_OPEN_NEW_TAB") {
          if (message.url && chrome.tabs?.create) {
            await chrome.tabs.create({ url: message.url });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: "invalid-url" });
          }
          return;
        }
        if (message.type === "SPOTLIGHT_CRAWL_SITE") {
          if (!message.origin) {
            sendResponse({ success: false, error: "no-origin" });
            return;
          }
          try {
            const allTabs = await chrome.tabs.query({});
            const seedTab = allTabs.find((t) => t.url && t.id && new URL(t.url).origin === message.origin);
            if (seedTab?.id) {
              const resp = await chrome.tabs.sendMessage(seedTab.id, { type: "GET_MANIFEST" });
              if (resp?.success?.manifest) {
                let siteIndex = siteIndices.get(message.origin);
                if (!siteIndex) {
                  siteIndex = createSearchIndex();
                  siteIndices.set(message.origin, siteIndex);
                }
                addToIndex(siteIndex, resp.manifest.records);
                sendResponse({ success: true, recordCount: resp.manifest.records.length });
              } else {
                sendResponse({ success: false, error: "no-manifest" });
              }
            } else {
              sendResponse({ success: false, error: "no-tab-for-origin" });
            }
          } catch (err) {
            sendResponse({ success: false, error: err?.message || String(err) });
          }
          return;
        }
        if (message.type === "LIBRARY_OPEN_RECENT") {
          if (message.url && chrome.tabs?.create) {
            await chrome.tabs.create({ url: message.url });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: "invalid-url" });
          }
          return;
        }
        if (message.type === "LIST_OPEN_TABS") {
          const result = await listOpenTabs();
          sendResponse({
            success: true,
            items: result.items
          });
          return;
        }
        sendResponse({ success: false, error: "unsupported-background-message" });
      } catch (err) {
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true;
  });
}
if (typeof chrome !== "undefined" && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabIndices.delete(tabId);
  });
}
if (typeof chrome !== "undefined" && chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "open-spotlight") return;
    if (!chrome.tabs?.query) return;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) return;
      await chrome.tabs.sendMessage(activeTab.id, { type: "SHOW_SPOTLIGHT" });
    } catch {
    }
  });
}
//# sourceMappingURL=background.js.map
