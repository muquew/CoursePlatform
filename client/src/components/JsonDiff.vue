<template>
  <div class="json-diff">
    <div class="toolbar">
      <label class="toggle">
        <input type="checkbox" v-model="showUnchanged" />
        <span>{{ t('json_diff.show_unchanged') }}</span>
      </label>

      <div class="meta">
        <span class="pill">{{ t('json_diff.changed') }}: {{ changedCount }}</span>
        <span class="pill">{{ t('json_diff.total') }}: {{ allItems.length }}</span>
      </div>
    </div>

    <div class="diff-table">
      <div class="diff-head">
        <div class="cell gutter"></div>
        <div class="cell key">{{ t('json_diff.key') }}</div>
        <div class="cell col">{{ t('json_diff.before') }}</div>
        <div class="cell col">{{ t('json_diff.after') }}</div>
      </div>

      <div
        v-for="item in visibleItems"
        :key="item.key"
        class="diff-row"
        :data-type="item.type"
      >
        <div class="cell gutter">
          <span class="mark" :data-type="item.type">{{ mark(item.type) }}</span>
        </div>

        <div class="cell key">
          <span class="k" :title="item.key">"{{ item.key }}"</span><span class="colon">:</span>
        </div>

        <div class="cell col before">
          <pre v-if="beforeText(item) !== ''">{{ beforeText(item) }}</pre>
          <span v-else class="empty">—</span>
        </div>

        <div class="cell col after">
          <pre v-if="afterText(item) !== ''">{{ afterText(item) }}</pre>
          <span v-else class="empty">—</span>
        </div>
      </div>

      <div v-if="visibleItems.length === 0" class="no-changes">
        {{ t('json_diff.no_changes') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({ name: 'JsonDiff' });

const { t } = useI18n();

type DiffType = 'added' | 'removed' | 'modified' | 'unchanged';

type DiffItem =
  | { key: string; type: 'added'; newValue: any }
  | { key: string; type: 'removed'; oldValue: any }
  | { key: string; type: 'modified'; oldValue: any; newValue: any }
  | { key: string; type: 'unchanged'; value: any };

const props = defineProps<{
  before?: any;
  after?: any;
}>();

const showUnchanged = ref(false);

/** 更稳的深比较：比 JSON.stringify 更可靠（key 顺序、NaN、循环引用防护） */
const deepEqual = (a: any, b: any, seen = new WeakMap<object, object>()): boolean => {
  if (Object.is(a, b)) return true;

  if (a === null || b === null) return a === b;
  const ta = typeof a;
  const tb = typeof b;
  if (ta !== tb) return false;
  if (ta !== 'object') return a === b;

  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp) return String(a) === String(b);

  if (seen.has(a) && seen.get(a) === b) return true;
  seen.set(a, b);

  const isArrA = Array.isArray(a);
  const isArrB = Array.isArray(b);
  if (isArrA || isArrB) {
    if (!(isArrA && isArrB)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], seen)) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
  }
  for (const k of keysA) {
    if (!deepEqual(a[k], b[k], seen)) return false;
  }
  return true;
};

const isTraversable = (v: any) => {
  // 仅把 “普通对象/数组” 当成可递归节点（Date/RegExp 等当叶子）
  return v !== null && typeof v === 'object' && !(v instanceof Date) && !(v instanceof RegExp);
};

const isSimpleIdent = (k: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k);

const joinObjPath = (base: string, prop: string) => {
  // base = "" 时直接返回 prop 或 ["weird.key"]
  if (!base) return isSimpleIdent(prop) ? prop : `[${JSON.stringify(prop)}]`;
  // base 非空时：简单 key 用点号，否则用 bracket
  return isSimpleIdent(prop) ? `${base}.${prop}` : `${base}[${JSON.stringify(prop)}]`;
};

const joinArrPath = (base: string, idx: number) => {
  return base ? `${base}[${idx}]` : `[${idx}]`;
};

const formatValue = (v: any) => {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';

  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);

  if (typeof v === 'object') {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v);
};

// 递归 diff：输出 a.b.c / arr[0].x
const allItems = computed<DiffItem[]>(() => {
  const beforeRoot = (props.before ?? {}) as any;
  const afterRoot = (props.after ?? {}) as any;

  const res: DiffItem[] = [];
  const MAX_DEPTH = 30; // 防止极端数据递归过深（可按需调大/调小）

  const pushLeaf = (path: string, a: any, b: any) => {
    if (!deepEqual(a, b)) res.push({ key: path, type: 'modified', oldValue: a, newValue: b });
    else res.push({ key: path, type: 'unchanged', value: a });
  };

  const walk = (path: string, hasA: boolean, a: any, hasB: boolean, b: any, depth: number) => {
    if (hasA && !hasB) {
      res.push({ key: path, type: 'removed', oldValue: a });
      return;
    }
    if (!hasA && hasB) {
      res.push({ key: path, type: 'added', newValue: b });
      return;
    }

    // both exist
    const aIsObj = isTraversable(a);
    const bIsObj = isTraversable(b);

    // 类型不一致 / 不是对象 => 直接当叶子比较
    if (!aIsObj || !bIsObj || Array.isArray(a) !== Array.isArray(b)) {
      pushLeaf(path, a, b);
      return;
    }

    // 都是对象/数组
    if (deepEqual(a, b)) {
      // 不展开整棵完全相同的子树，直接标记为 unchanged（避免爆炸）
      res.push({ key: path, type: 'unchanged', value: a });
      return;
    }

    if (depth >= MAX_DEPTH) {
      // 深度太深：退化成整块 modified
      res.push({ key: path, type: 'modified', oldValue: a, newValue: b });
      return;
    }

    // 数组：按 index 递归
    if (Array.isArray(a) && Array.isArray(b)) {
      const maxLen = Math.max(a.length, b.length);
      for (let i = 0; i < maxLen; i++) {
        const hasAi = i in a;
        const hasBi = i in b;
        const p = joinArrPath(path, i);
        walk(p, hasAi, a[i], hasBi, b[i], depth + 1);
      }
      return;
    }

    // 对象：按 key 递归
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const hasAk = Object.prototype.hasOwnProperty.call(a, k);
      const hasBk = Object.prototype.hasOwnProperty.call(b, k);
      const p = joinObjPath(path, k);
      walk(p, hasAk, a[k], hasBk, b[k], depth + 1);
    }
  };

  // 从 root 的第一层开始（避免出现空 key）
  const rootKeys = new Set([...Object.keys(beforeRoot), ...Object.keys(afterRoot)]);
  for (const k of rootKeys) {
    const hasA = Object.prototype.hasOwnProperty.call(beforeRoot, k);
    const hasB = Object.prototype.hasOwnProperty.call(afterRoot, k);
    const p = joinObjPath('', k);
    walk(p, hasA, beforeRoot[k], hasB, afterRoot[k], 0);
  }

  return res.sort((a, b) => a.key.localeCompare(b.key));
});

const visibleItems = computed(() =>
  showUnchanged.value ? allItems.value : allItems.value.filter((x) => x.type !== 'unchanged')
);

const changedCount = computed(() => allItems.value.filter((x) => x.type !== 'unchanged').length);

const beforeText = (item: DiffItem) => {
  if (item.type === 'added') return '';
  if (item.type === 'removed') return formatValue(item.oldValue);
  if (item.type === 'modified') return formatValue(item.oldValue);
  return formatValue(item.value);
};

const afterText = (item: DiffItem) => {
  if (item.type === 'removed') return '';
  if (item.type === 'added') return formatValue(item.newValue);
  if (item.type === 'modified') return formatValue(item.newValue);
  return formatValue(item.value);
};

const mark = (t: DiffType) => {
  if (t === 'added') return '+';
  if (t === 'removed') return '-';
  if (t === 'modified') return '~';
  return '·';
};
</script>

<style scoped>
.json-diff {
  --cardBg: #f3f4f6;
  --panelBg: #ffffff;
  --border: #e5e7eb;
  --text: #111827;
  --muted: #6b7280;

  --added: #16a34a;
  --removed: #dc2626;
  --modified: #d97706;

  --addedLine: rgba(22, 163, 74, 0.55);
  --removedLine: rgba(220, 38, 38, 0.55);
  --modifiedLine: rgba(217, 119, 6, 0.55);

  --addedBg: rgba(22, 163, 74, 0.10);
  --removedBg: rgba(220, 38, 38, 0.10);
  --modifiedBg: rgba(217, 119, 6, 0.10);

  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 12px;
  color: var(--text);

  background: var(--cardBg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  margin: 10px 0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  background: var(--panelBg);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 10px;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  user-select: none;
}

.toggle input {
  transform: translateY(1px);
}

.meta {
  display: inline-flex;
  gap: 8px;
}

.pill {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 2px 8px;
  color: var(--muted);
}

.diff-table {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--panelBg);
}

.diff-head,
.diff-row {
  display: grid;
  /* 嵌套路径会更长，key 列稍加宽 */
  grid-template-columns: 28px 260px 1fr 1fr;
}

.diff-head {
  background: #f9fafb;
  border-bottom: 1px solid var(--border);
}

.cell {
  padding: 8px 10px;
  border-right: 1px solid var(--border);
}

.cell:last-child {
  border-right: none;
}

.diff-row {
  border-bottom: 1px solid var(--border);
}

.diff-row:nth-of-type(even) {
  background: rgba(249,250,251,0.65);
}

.diff-row:last-child {
  border-bottom: none;
}

.diff-row:hover {
  background: rgba(243,244,246,0.9);
}

.cell.gutter {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 8px 0;
}

.mark {
  font-weight: 900;
  line-height: 1;
  padding-top: 2px;
}

.diff-row[data-type="added"] .cell.gutter { background: var(--addedBg); }
.diff-row[data-type="removed"] .cell.gutter { background: var(--removedBg); }
.diff-row[data-type="modified"] .cell.gutter { background: var(--modifiedBg); }

.mark[data-type="added"] { color: var(--added); }
.mark[data-type="removed"] { color: var(--removed); }
.mark[data-type="modified"] { color: var(--modified); }
.mark[data-type="unchanged"] { color: var(--muted); opacity: 0.7; }

.diff-row[data-type="added"]    { border-left: 2px solid rgba(22,163,74,0.65); }
.diff-row[data-type="removed"]  { border-left: 2px solid rgba(220,38,38,0.65); }
.diff-row[data-type="modified"] { border-left: 2px solid rgba(217,119,6,0.65); }

.cell.key .k {
  color: var(--text);
  font-weight: 700;

  display: inline-block;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.cell.key .colon {
  color: var(--muted);
  margin-left: 2px;
}

.cell.col pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
  color: var(--text);

  background: #ffffff;
  border: 1px solid rgba(229,231,235,0.9);
  border-radius: 8px;
  padding: 6px 8px;

  max-height: 160px;
  overflow: auto;
}

.cell.col pre::-webkit-scrollbar { height: 8px; width: 8px; }
.cell.col pre::-webkit-scrollbar-thumb {
  background: rgba(17,24,39,0.18);
  border-radius: 8px;
}

.empty {
  color: var(--muted);
  opacity: 0.85;
}

.diff-row[data-type="added"] .cell.col.after {
  box-shadow: inset 4px 0 0 0 var(--addedLine);
  background: var(--addedBg);
}
.diff-row[data-type="removed"] .cell.col.before {
  box-shadow: inset 4px 0 0 0 var(--removedLine);
  background: var(--removedBg);
}
.diff-row[data-type="modified"] .cell.col.before,
.diff-row[data-type="modified"] .cell.col.after {
  box-shadow: inset 4px 0 0 0 var(--modifiedLine);
  background: var(--modifiedBg);
}

.no-changes {
  padding: 10px;
  color: var(--muted);
  font-style: italic;
  background: #fff;
  border: 1px dashed var(--border);
  border-radius: 10px;
}
</style>
