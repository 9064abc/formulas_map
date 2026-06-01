import React, { useState, useCallback, useEffect, useMemo, useRef} from 'react';
import ReactFlow, { 
  Controls, 
  Background, 
  applyNodeChanges, 
  applyEdgeChanges,
  addEdge, 
  ReactFlowProvider,
  useReactFlow,
  SelectionMode
} from 'reactflow';
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import 'reactflow/dist/style.css'; // React Flowの基本スタイル
import './App.css';
import CustomNode from './Customnode.jsx';
const nodeTypes = { custom: CustomNode };

// --- 初期データ（ここを将来的にユーザー入力やJSON読み込みにする） ---
const flowKey = 'physics-mapper-flow';
const dbName = 'physics-mapper-db';
const dbVersion = 1;
const flowStoreName = 'flows';

const defaultCategories = [
  { id: 'default', name: '未分類', color: '#D3D3D3' },
  { id: 'mech', name: '古典力学', color: '#B3E5FC' },
  { id: 'em', name: '電磁気学', color: '#FFCDD2' },
  { id: 'therm', name: '熱力学', color: '#C8E6C9' },
];

const getDefaultFlow = () => {
  return {
    nodes: [
      { 
        id: 'node-1', position: { x: 250, y: 50 }, 
        data: { label: '運動方程式', formula: 'F = ma', description: '物体に働く力 F は、質量 m と加速度 a の積に等しい。', category: 'mechanics' },
        style: { background: '#E3F2FD', border: '1px solid #2196F3', minwidth: 180 }
      },
      { 
        id: 'node-2', position: { x: 100, y: 250 }, 
        data: { label: '加速度の定義', formula: 'a = \\frac{dv}{dt}', description: '加速度 a は速度 v の時間微分である。', category: 'mechanics' },
        style: { background: '#E3F2FD', border: '1px solid #2196F3', minwidth: 180 }
      },
    ],
    edges: [
      { id: 'e1-2', source: 'node-2', target: 'node-1', animated: true, label: '代入' }
    ],
    idCount: 3,
    categories: defaultCategories
  };
};

const normalizeFlow = (flow) => {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const edges = Array.isArray(flow?.edges) ? flow.edges : [];
  const categories = Array.isArray(flow?.categories) ? flow.categories : defaultCategories;

  // data.nodeContentType は現在のグローバル設定で上書きする
  const unifiedNodes = nodes.map(node => ({
    ...node,
    data: { ...node.data, nodeContentType: 'label' }
  }));

  // 既存ノードの最大IDを求め、その次の番号から開始するようにする
  const maxId = unifiedNodes.reduce((max, node) => {
    const idNum = parseInt(node.id?.split('-')[1], 10);
    return idNum > max ? idNum : max;
  }, 0);

  return {
    nodes: unifiedNodes,
    edges,
    idCount: maxId > 0 ? maxId + 1 : 1,
    categories
  };
};

const openFlowDatabase = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(flowStoreName)) {
        db.createObjectStore(flowStoreName);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const readFlowFromIndexedDb = async () => {
  const db = await openFlowDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(flowStoreName, 'readonly');
    const store = transaction.objectStore(flowStoreName);
    const request = store.get(flowKey);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

const writeFlowToIndexedDb = async (flow) => {
  const db = await openFlowDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(flowStoreName, 'readwrite');
    const store = transaction.objectStore(flowStoreName);
    store.put(flow, flowKey);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

const loadInitialFlow = async () => {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return getDefaultFlow();
  }

  const legacySavedFlow = localStorage.getItem(flowKey);
  if (legacySavedFlow) {
    const migratedFlow = normalizeFlow(JSON.parse(legacySavedFlow));
    await writeFlowToIndexedDb(migratedFlow);
    localStorage.removeItem(flowKey);
    return migratedFlow;
  }

  const indexedDbFlow = await readFlowFromIndexedDb();
  return indexedDbFlow ? normalizeFlow(indexedDbFlow) : getDefaultFlow();
};

const categoryStyles = {
  mechanics: { background: '#E3F2FD', border: '1px solid #2196F3' }, // 青系
  electromagnetism: { background: '#FFEBEE', border: '1px solid #F44336' }, // 赤系
  thermodynamics: { background: '#FFF3E0', border: '1px solid #FF9800' }, // オレンジ系
  math: { background: '#F3E5F5', border: '1px solid #9C27B0' }, // 紫系
  default: { background: '#ffffff', border: '1px solid #777' }
};

const parseLatexDescription = (text = '') => {
  const tokens = [];
  let cursor = 0;
  let textStart = 0;

  const pushText = (end) => {
    if (end > textStart) {
      tokens.push({
        type: 'text',
        value: text.slice(textStart, end),
        raw: text.slice(textStart, end),
        start: textStart,
        end
      });
    }
  };

  while (cursor < text.length) {
    if (text.startsWith('$$', cursor)) {
      const closeIndex = text.indexOf('$$', cursor + 2);
      if (closeIndex !== -1) {
        const value = text.slice(cursor + 2, closeIndex);
        if (value.trim()) {
          pushText(cursor);
          tokens.push({
            type: 'blockMath',
            value,
            raw: text.slice(cursor, closeIndex + 2),
            start: cursor,
            end: closeIndex + 2
          });
          cursor = closeIndex + 2;
          textStart = cursor;
          continue;
        }
      }
    }

    if (text[cursor] === '$' && text[cursor + 1] !== '$') {
      const closeIndex = text.indexOf('$', cursor + 1);
      if (closeIndex !== -1) {
        const value = text.slice(cursor + 1, closeIndex);
        if (value.trim()) {
          pushText(cursor);
          tokens.push({
            type: 'inlineMath',
            value,
            raw: text.slice(cursor, closeIndex + 1),
            start: cursor,
            end: closeIndex + 1
          });
          cursor = closeIndex + 1;
          textStart = cursor;
          continue;
        }
      }
    }

    cursor += 1;
  }

  pushText(text.length);
  return tokens;
};

const renderTextWithLineBreaks = (text) => {
  return text.split('\n').map((line, index) => (
    <React.Fragment key={index}>
      {index > 0 && <br />}
      {line}
    </React.Fragment>
  ));
};

const csvHeaders = ['record_type', 'payload_json'];

const escapeCsvCell = (value) => {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
};

const serializeCsv = (rows) => {
  return [
    csvHeaders.map(escapeCsvCell).join(','),
    ...rows.map((row) => csvHeaders.map((header) => escapeCsvCell(row[header])).join(','))
  ].join('\n');
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  if (rows.length === 0) return [];

  const headers = rows[0];
  return rows.slice(1)
    .filter((cells) => cells.some((value) => value !== ''))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
};

const buildExportRows = ({ nodes, edges, categories }) => {
  const selectedNodeIds = new Set(nodes.map((node) => node.id));
  const selectedCategoryIds = new Set(nodes.map((node) => node.data?.category).filter(Boolean));
  const internalEdges = edges.filter((edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target));

  return [
    {
      record_type: 'metadata',
      payload_json: JSON.stringify({ app: 'formulas_map', version: 1 })
    },
    ...categories
      .filter((category) => selectedCategoryIds.has(category.id))
      .map((category) => ({
        record_type: 'category',
        payload_json: JSON.stringify(category)
      })),
    ...nodes.map((node) => ({
      record_type: 'node',
      payload_json: JSON.stringify(node)
    })),
    ...internalEdges.map((edge) => ({
      record_type: 'edge',
      payload_json: JSON.stringify(edge)
    }))
  ];
};

const downloadCsv = (rows, filename) => {
  const csv = serializeCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const getNextNodeNumber = (nodes, idCount) => {
  const maxNodeId = nodes.reduce((max, node) => {
    const idNum = parseInt(node.id?.split('-')[1], 10);
    return idNum > max ? idNum : max;
  }, 0);
  return Math.max(idCount, maxNodeId + 1, 1);
};

const makeUniqueCategoryId = (baseId, existingCategoryIds) => {
  let index = 1;
  let nextId = `${baseId}-imported`;
  while (existingCategoryIds.has(nextId)) {
    index += 1;
    nextId = `${baseId}-imported-${index}`;
  }
  return nextId;
};

const buildImportedFlowPatch = ({ csvText, nodes, edges, categories, idCount }) => {
  const csvRows = parseCsv(csvText);
  const parsedRows = csvRows.map((row) => ({
    recordType: row.record_type,
    payload: JSON.parse(row.payload_json)
  }));

  const importedCategories = parsedRows
    .filter((row) => row.recordType === 'category')
    .map((row) => row.payload);
  const importedNodes = parsedRows
    .filter((row) => row.recordType === 'node')
    .map((row) => row.payload);
  const importedEdges = parsedRows
    .filter((row) => row.recordType === 'edge')
    .map((row) => row.payload);

  if (importedNodes.length === 0) {
    throw new Error('CSVにノード情報がありません。');
  }

  const nextCategories = [...categories];
  const categoryIdMap = new Map();
  const existingCategoryIds = new Set(categories.map((category) => category.id));

  importedCategories.forEach((category) => {
    if (!category?.id) return;

    const sameCategory = categories.find((existing) => (
      existing.id === category.id &&
      existing.name === category.name &&
      existing.color === category.color
    ));
    if (sameCategory) {
      categoryIdMap.set(category.id, sameCategory.id);
      return;
    }

    const matchingCategory = categories.find((existing) => (
      existing.name === category.name &&
      existing.color === category.color
    ));
    if (matchingCategory) {
      categoryIdMap.set(category.id, matchingCategory.id);
      return;
    }

    const nextId = existingCategoryIds.has(category.id)
      ? makeUniqueCategoryId(category.id, existingCategoryIds)
      : category.id;
    existingCategoryIds.add(nextId);
    categoryIdMap.set(category.id, nextId);
    nextCategories.push({ ...category, id: nextId });
  });

  const nodeIdMap = new Map();
  let nextNodeNumber = getNextNodeNumber(nodes, idCount);
  const nextNodes = importedNodes.map((node) => {
    const nextId = `node-${nextNodeNumber}`;
    nextNodeNumber += 1;
    nodeIdMap.set(node.id, nextId);

    const oldCategoryId = node.data?.category || 'default';
    const nextCategoryId = categoryIdMap.get(oldCategoryId)
      || (existingCategoryIds.has(oldCategoryId) ? oldCategoryId : 'default');

    return {
      ...node,
      id: nextId,
      type: undefined,
      className: undefined,
      selected: false,
      position: {
        x: Number(node.position?.x || 0) + 40,
        y: Number(node.position?.y || 0) + 40
      },
      data: {
        ...node.data,
        category: nextCategoryId,
        nodeContentType: 'label'
      }
    };
  });

  const existingEdgeIds = new Set(edges.map((edge) => edge.id));
  const nextEdges = importedEdges
    .filter((edge) => nodeIdMap.has(edge.source) && nodeIdMap.has(edge.target))
    .map((edge, index) => {
      const source = nodeIdMap.get(edge.source);
      const target = nodeIdMap.get(edge.target);
      let nextId = `e-${source}-${target}`;
      let suffix = index + 1;
      while (existingEdgeIds.has(nextId)) {
        suffix += 1;
        nextId = `e-${source}-${target}-${suffix}`;
      }
      existingEdgeIds.add(nextId);

      return {
        ...edge,
        id: nextId,
        source,
        target,
        selected: false
      };
    });

  return {
    nodes: nextNodes,
    edges: nextEdges,
    categories: nextCategories,
    idCount: nextNodeNumber
  };
};

function DescriptionLatexView({ value }) {
  const tokens = useMemo(() => parseLatexDescription(value), [value]);

  return (
    <div className="latex-description-view">
      {tokens.map((token, index) => {
        if (token.type === 'blockMath') {
          return (
            <div className="latex-block-view" key={`${token.start}-${index}`}>
              <BlockMath math={token.value} />
            </div>
          );
        }

        if (token.type === 'inlineMath') {
          return <InlineMath key={`${token.start}-${index}`} math={token.value} />;
        }

        return (
          <span key={`${token.start}-${index}`}>
            {renderTextWithLineBreaks(token.value)}
          </span>
        );
      })}
    </div>
  );
}

function DescriptionLatexEditor({ value, onChange }) {
  const [editingTokenIndex, setEditingTokenIndex] = useState(null);
  const [tokenDraft, setTokenDraft] = useState('');
  const tokens = useMemo(() => parseLatexDescription(value), [value]);

  const startTokenEdit = (token, index) => {
    setEditingTokenIndex(index);
    setTokenDraft(token.raw);
  };

  const saveTokenEdit = () => {
    const token = tokens[editingTokenIndex];
    if (!token) return;

    onChange(`${value.slice(0, token.start)}${tokenDraft}${value.slice(token.end)}`);
    setEditingTokenIndex(null);
    setTokenDraft('');
  };

  const cancelTokenEdit = () => {
    setEditingTokenIndex(null);
    setTokenDraft('');
  };

  return (
    <div className="latex-editor">
      <textarea
        className="latex-source-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="latex-live-preview">
        {tokens.map((token, index) => {
          const key = `${token.start}-${index}`;

          if (index === editingTokenIndex) {
            return (
              <span className="latex-token-editor" key={key}>
                <textarea
                  value={tokenDraft}
                  onChange={(event) => setTokenDraft(event.target.value)}
                  autoFocus
                />
                <span className="latex-token-actions">
                  <button type="button" className="btn btn-primary" onClick={saveTokenEdit}>反映</button>
                  <button type="button" className="btn btn-secondary" onClick={cancelTokenEdit}>戻す</button>
                </span>
              </span>
            );
          }

          if (token.type === 'blockMath') {
            return (
              <button
                type="button"
                className="latex-token latex-token-block"
                key={key}
                onClick={() => startTokenEdit(token, index)}
              >
                <BlockMath math={token.value} />
              </button>
            );
          }

          if (token.type === 'inlineMath') {
            return (
              <button
                type="button"
                className="latex-token latex-token-inline"
                key={key}
                onClick={() => startTokenEdit(token, index)}
              >
                <InlineMath math={token.value} />
              </button>
            );
          }

          return (
            <span key={key}>
              {renderTextWithLineBreaks(token.value)}
            </span>
          );
        })}
      </div>
    </div>
  );
}



// --- メインコンポーネント ---
function PhysicsMapper() {

  const initialFlow = getDefaultFlow();

  //console.log("start physicsmapper");
  //console.log(initialFlow.categories)
  // ノードとエッジの状態管理
  const [categories, setCategories] = useState(initialFlow.categories);

  const [edgeTypes] = useState([
    { id: 'derivation', name: '導出関係', style: { stroke: '#000000' }, marker: { type: 'arrowclosed' } },
    { id: 'definition', name: '定義', style: { stroke: '#007BFF', strokeWidth: 2 }, marker: { type: 'arrowclosed' }, label: 'Def.' },
    { id: 'equivalence', name: '同値関係', style: { stroke: '#28A745', strokeDasharray: '5, 5' }, marker: { type: 'arrowclosed', style: { fill: '#28A745' } }, type: 'default', label: '⇔' }, // カスタムエッジを使用
    { id: 'association', name: '関連', style: { stroke: '#6F42C1', strokeDasharray: '1, 2' }, marker: { type: 'none' } },
  ]);
  const [nodes, setNodes] = useState(initialFlow.nodes);
  const [edges, setEdges] = useState(initialFlow.edges);
  const [idCount, setIdCount] = useState(initialFlow.idCount);
  const [isFlowLoaded, setIsFlowLoaded] = useState(false);
  const [nodeContentType, setNodeContentType] = useState('label');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  
  // 選択されたノードの情報を保持する状態
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [isEditing, setIsEditing] = useState(false)
  const [isDragging, setIsDragging] = useState(false);
  const [formData, setFormData] = useState({label: '', formula: '', description: '', category: 'default'})
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [relatedNodesInfo, setRelatedNodesInfo] = useState({sources: [], targets: []});
  const [inspectorWidth, setInspectorWidth] = useState(300);
  const importFileInputRef = useRef(null);

  // React Flowのインスタンス操作用（画面中心取得のため）
  const { getViewport } = useReactFlow();

  useEffect(() => {
    let isCancelled = false;

    loadInitialFlow()
      .then((loadedFlow) => {
        if (isCancelled) return;

        setNodes(loadedFlow.nodes);
        setEdges(loadedFlow.edges);
        setIdCount(loadedFlow.idCount);
        setCategories(loadedFlow.categories);
      })
      .catch((error) => {
        console.error('IndexedDBからのデータ読み込みに失敗しました', error);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsFlowLoaded(true);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isFlowLoaded) return;

    // ユーザーが操作を停止した後に実行されるよう、タイマーを設定
    const timer = setTimeout(() => {
      const flowToSave = { nodes, edges, idCount, categories };
      writeFlowToIndexedDb(flowToSave)
        .then(() => {
          console.log("IndexedDBへのデータ保存を実行しました");
        })
        .catch((error) => {
          console.error('IndexedDBへのデータ保存に失敗しました', error);
        });
    }, 500); // 500ミリ秒 (0.5秒) の遅延を設定

    // クリーンアップ関数: 新しい変更があったら古いタイマーをキャンセル
    return () => clearTimeout(timer);

// nodes, edges, idCount, categories のいずれかが変更されるたびにタイマーがリセットされる
}, [nodes, edges, idCount, categories, isFlowLoaded]);

  // ノードがドラッグされた時の処理
  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)),[]);
  // エッジが変更された時の処理
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),[]);

  const onSelectionChange = useCallback(({ nodes: selectedNodes }) => {
    setSelectedNodeIds(selectedNodes.map((node) => node.id));
  }, []);

  const onEdgeClick = useCallback((event, edge) => {
    if (selectedEdge && selectedEdge.id === edge.id) {
      // 既に選択されているエッジを再度クリックした場合、パネルを閉じる
      setSelectedEdge(null);
  } else {
      // 別のエッジをクリックした場合、そのエッジの編集パネルを開く
      setSelectedEdge(edge);
  }
    // ノードパネルが開いていれば閉じるなど、必要に応じて調整
    event.stopPropagation();
}, [selectedEdge]);
  // ノード同士を手動でつないだ時の処理
  const onConnect = useCallback((params) => setEdges((eds) => addEdge({...params, typeId: 'derivation'}, eds)),[]);

  const handleResizeStart = useCallback((event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;

    const handleMouseMove = (moveEvent) => {
      const maxWidth = Math.max(240, window.innerWidth - 320);
      const nextWidth = startWidth + startX - moveEvent.clientX;
      setInspectorWidth(Math.min(maxWidth, Math.max(240, nextWidth)));
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [inspectorWidth]);

  // ドラッグ開始時
  const onNodeDragStart = useCallback(() => {
  // ドラッグ中はハイライト計算を停止
    setIsDragging(true); 
  }, []);

  // ドラッグ終了時
  const onNodeDragStop = useCallback(() => {
    // ドラッグ終了後、ハイライトと選択状態を復元
    setIsDragging(false); 
  
    // ドラッグ停止後、ノード選択をシミュレートしてハイライトを更新
    // setSelectedNodeId(node.id); // これは onNodeClickで処理されるため、不要な場合がある

  }, []);

  // ノードをクリックした時の処理（詳細パネルへの表示）
  const onChangeCategory = useCallback( (event) => {
    const { name, value } = event.target;
    
    if (value === 'new-category') {
        // ★★★ "新規追加"が選択されたらモーダルを開く ★★★
        console.log('new-category')
        setIsCategoryModalOpen(true);
        return; 
    }
    console.log('setform'+ value+name)
    // 通常のフォーム処理（handleFormChange の内容）
    setFormData((prevData) => { return{
        ...prevData,
        [name]: value};
    });
    }, [setIsCategoryModalOpen, setFormData]
  );

  const onNodeClick = useCallback(
    (event, node) => {
      setSelectedNodeId(node.id);
      setSelectedNodeIds([node.id]);
      setFormData(node.data);
      setIsEditing(false);

      const sources = [];
      const targets = [];
      const newHighlightedNodes = new Set();
      newHighlightedNodes.add(node.id); // 自身を選択

      // 関連するエッジを検索し、関連ノードIDを収集
      edges.forEach(edge => {
        if (edge.target === node.id) {
          const sourceNode = nodes.find(n => n.id === edge.source);
          if (sourceNode) {
              sources.push({
                  id: sourceNode.id,
                  formula: sourceNode.data.formula
              });
              newHighlightedNodes.add(sourceNode.id);
          }
        }
      
        // 2. 導出先 (このノードを Source とするエッジ)
        if (edge.source === node.id) {
          const targetNode = nodes.find(n => n.id === edge.target);
          if (targetNode) {
              targets.push({
                  id: targetNode.id,
                  formula: targetNode.data.formula
              });
              newHighlightedNodes.add(targetNode.id);
          }
        }  
      }
    );
    setRelatedNodesInfo({sources, targets});
    setHighlightedNodes(newHighlightedNodes);
    },
    [edges, nodes]
  );

  // 背景（キャンバス）をクリックしたら選択解除
  const onPaneClick = useCallback(
    () => {
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      setIsEditing(false);
      setHighlightedNodes(new Set());
      setSelectedEdge(null);
      setRelatedNodesInfo({ sources: [], targets: [] });
    },
    []
  );

  const handleSaveCategory = useCallback((newCategory) => {
    setCategories(prevCategories => {
        // IDが既存であれば更新、なければ追加
        const existingIndex = prevCategories.findIndex(c => c.id === newCategory.id);
        if (existingIndex > -1) {
            // 更新
            const updatedCategories = [...prevCategories];
            updatedCategories[existingIndex] = newCategory;
            return updatedCategories;
        } else {
            // 新規追加
            return [...prevCategories, { 
                ...newCategory, 
                // IDはユニークなタイムスタンプなどで生成
                id: new Date().getTime().toString() 
            }];
        }
    });
    setIsCategoryModalOpen(false); // モーダルを閉じる
  }, []);

  const handleAddNode = () => {
    // 現在の画面の中心座標を計算する
    const { x, y, zoom } = getViewport();
    // 画面中央（左側のキャンバスエリア）の大体の中心
    const centerX = (-x + (window.innerWidth - inspectorWidth) / 2) / zoom;
    const centerY = (-y + window.innerHeight / 2) / zoom;

    const newId = `node-${idCount}`;
    const newNode = {
      id: newId,
      position: { x: centerX - 90, y: centerY - 50 }, // 中心から少しずらす（ノードの半分のサイズ分）
      data: { 
        label: '新しい法則', 
        formula: 'x = ?', 
        description: 'ここに説明を書く', 
        category: 'default' ,
        nodeContentType: nodeContentType
      },
      style: { ...categoryStyles.default, minwidth: 150 }
    };

    setNodes((nds) => nds.concat(newNode));
    setIdCount((c) => c + 1); // カウンターを進める
    
    // 追加したノードを即座に選択状態にする
    setSelectedNodeId(newId);
    setFormData(newNode.data);
    setIsEditing(true); // 即編集モードへ
  };

  const handleDeleteNode = () => {
    if (!selectedNodeId) return; // 選択ノードがなければ何もしない

    // 1. nodes配列から該当ノードをフィルタリングして削除
    setNodes((nds) => nds.filter((node) => node.id !== selectedNodeId));
    
    // 2. 選択状態を解除 (インスペクターを空の状態に戻す)
    setSelectedNodeId(null);
    setIsEditing(false);
  };

  const handleSave = () => {
    // 1. formDataから選択されたカテゴリーIDを取得
    const selectedCategoryId = formData.category || 'default'; 
    
    // 2. categories配列から、そのIDを持つカテゴリーオブジェクトを直接検索
    const selectedCategory = categories.find(
        cat => cat.id === selectedCategoryId
    ) || categories.find(cat => cat.id === 'default'); // 見つからなければデフォルトに戻す
    
    // 3. 取得したカテゴリーの色を決定
    const newBackgroundColor = selectedCategory ? selectedCategory.color : '#D3D3D3';
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNodeId) {
          // カテゴリに応じて色も更新
          //const style = categoryStyles[formData.category] || categoryStyles.default;
          return {
            ...node,
            data: { ...formData },
            style: { ...node.style, backgroundColor: newBackgroundColor, width: 180 }
          };
        }
        return node;
      })
    );
    setIsEditing(false); // 閲覧モードに戻る
  };

  const handleExportCsv = useCallback((scope) => {
    const nodeIdsToExport = scope === 'all'
      ? new Set(nodes.map((node) => node.id))
      : new Set(selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : []);
    const nodesToExport = nodes.filter((node) => nodeIdsToExport.has(node.id));

    if (nodesToExport.length === 0) {
      window.alert('エクスポートするノードが選択されていません。');
      return;
    }

    const rows = buildExportRows({ nodes: nodesToExport, edges, categories });
    const dateText = new Date().toISOString().slice(0, 10);
    const filename = scope === 'all'
      ? `formulas-map-all-${dateText}.csv`
      : `formulas-map-selection-${dateText}.csv`;
    downloadCsv(rows, filename);
  }, [categories, edges, nodes, selectedNodeId, selectedNodeIds]);

  const handleImportClick = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  const handleImportCsv = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const patch = buildImportedFlowPatch({
          csvText: String(reader.result || ''),
          nodes,
          edges,
          categories,
          idCount
        });

        setCategories(patch.categories);
        setNodes((currentNodes) => currentNodes.concat(patch.nodes));
        setEdges((currentEdges) => currentEdges.concat(patch.edges));
        setIdCount(patch.idCount);
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        setHighlightedNodes(new Set());
        setRelatedNodesInfo({ sources: [], targets: [] });
        setSelectedEdge(null);
      } catch (error) {
        console.error('CSVのインポートに失敗しました', error);
        window.alert('CSVのインポートに失敗しました。ファイル形式を確認してください。');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }, [categories, edges, idCount, nodes]);

  const onEdgeDoubleClick = useCallback((event, edge) => {
    // ダブルクリックしたエッジをedges配列からフィルタリングして削除
    setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    // 標準のブラウザメニューが開かないように阻止
    event.preventDefault(); 
  }, []);

  const handleToggleContentType = useCallback((newType) => {
    // 1. グローバルな表示形式の状態を更新
    setNodeContentType(newType);

    // 2. ★★★ すべてのノードの data.nodeContentType を強制的に更新 ★★★
    setNodes(prevNodes => prevNodes.map(node => ({
        ...node,
        data: {
            ...node.data,
            // 最新の表示タイプを data に強制的に書き込む
            nodeContentType: newType,
        },
    })));
}, [setNodes]); // setNodes を依存配列に入れる

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const styledNodes = useMemo(() => {return nodes.map(node => {
    if (isDragging) {
      // ハイライトクラスや薄くするクラスを付けず、元のノードを返す
      /*const data = { ...node.data, }; 
      data.nodeContentType = nodeContentType;*/
      return { ...node, type: 'custom', /*data: {...data, nodeContentType: nodeContentType*/}; 
    }
    // ノードがハイライトされているか確認
    const isHighlighted = highlightedNodes.size === 0 || highlightedNodes.has(node.id);
    const isSelected = node.id === selectedNodeId;

    let className = '';
    if (isSelected) {
        className += ' node-selected ';
    } else if (isHighlighted) {
        className += ' node-highlighted ';
    } else if (selectedNodeId) {
        className += ' node-dimmed '; // 選択中ノードがある場合、その他を薄くする
    }

    const data = { ...node.data, }; 
    data.nodeContentType = nodeContentType;

    return { ...node,className: className.trim(), type: 'custom', data: data};
  });},[nodes, highlightedNodes, selectedNodeId, nodeContentType, isDragging]);
  
  
  const styledEdges = useMemo(() => {
    return edges.map(edge => {
        // 1. エッジの種類（typeId）を取得
        const edgeType = edgeTypes.find(et => et.id === edge.typeId) || edgeTypes.find(et => et.id === 'derivation');
        const isHighlighted = highlightedNodes.size === 0 || 
                          (highlightedNodes.has(edge.source) && highlightedNodes.has(edge.target));
    
        const highlightStyle = {
          strokeWidth: isHighlighted ? 2 : 1,
          opacity: isHighlighted ? 1 : 0.2
        };

        // 2. 種類に基づいてスタイルとプロパティを適用
        return {
            ...edge,
            // React Flowが認識する標準プロパティに変換して適用
            type: edgeType.type || 'default', // カスタムタイプがなければ 'default'
            style: { ...edgeType.style, ...highlightStyle },
            markerEnd: edgeType.marker,
            label: edgeType.label,
        };
    });
}, [edges, edgeTypes, highlightedNodes]);

  return (
    <div
      className="app-container"
      style={{ gridTemplateColumns: `minmax(320px, 1fr) 8px ${inspectorWidth}px` }}
    >
      {/* 左側：マップ領域 */}
      <div className="canvas-area">
        <ReactFlow
          nodes={styledNodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onSelectionChange={onSelectionChange}
          onPaneClick={onPaneClick}
          onEdgeClick={onEdgeClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodeDragStart={onNodeDragStart} 
          onNodeDragStop={onNodeDragStop}
          selectionOnDrag={true} 
          selectionMode={SelectionMode.Partial} 
          nodeTypes={nodeTypes}
          fitView // 初期表示時に全体が見えるように調整
        >
          <Background color="#aaa" gap={16} />
          <Controls />
        </ReactFlow>
        {selectedEdge && (
        <div className="inspector-panel" style={{ 
          // スタイルは適宜調整してください
          top: 10, left: 10, width: 300, position: 'absolute', 
          zIndex: 10 // 他の要素の上に表示させるため
          }}>
          <h3>エッジ情報</h3>
          <p>From: {selectedEdge.source} / To: {selectedEdge.target}</p>

          <label htmlFor="edgeType">関係性:</label>
          <select
            id="edgeType"
            value={selectedEdge.typeId || 'derivation'}
            onChange={(e) => {
                const newTypeId = e.target.value;
                setEdges(eds => eds.map(edge => 
                    edge.id === selectedEdge.id ? { ...edge, typeId: newTypeId } : edge
                ));
                // 編集中のパネル情報も更新
                setSelectedEdge(prev => ({ ...prev, typeId: newTypeId }));
            }}
            >
            {edgeTypes.map(type => (
                <option key={type.id} value={type.id}>
                    {type.name}
                </option>
            ))}
          </select>
        </div>
        )}

        {isCategoryModalOpen && (
            <div className="modal-overlay" style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
                justifyContent: 'center', alignItems: 'center', zIndex: 100
            }}>
                <div className="modal-content" style={{ 
                    backgroundColor: 'white', padding: '20px', borderRadius: '8px', 
                    width: '300px' 
                }}>
                    <h3>新規カテゴリーの追加</h3>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const newName = e.target.categoryName.value;
                        const newColor = e.target.categoryColor.value;
                        if (newName) {
                            handleSaveCategory({ name: newName, color: newColor });
                        }
                    }}>
                        <label htmlFor="categoryName" style={{ display: 'block', marginTop: '10px' }}>名前</label>
                        <input
                            type="text"
                            id="categoryName"
                            name="categoryName"
                            required
                            style={{ width: 'calc(100% - 10px)', padding: '5px' }}
                        />

                        <label htmlFor="categoryColor" style={{ display: 'block', marginTop: '10px' }}>色</label>
                        <input
                            type="color"
                            id="categoryColor"
                            name="categoryColor"
                            defaultValue="#FF5722"
                            style={{ width: '100%', height: '40px', padding: '0', border: 'none' }}
                        />

                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
                            <button type="button" onClick={() => setIsCategoryModalOpen(false)} style={{ background: '#ccc', padding: '10px' }}>キャンセル</button>
                            <button type="submit" style={{ background: '#5cb85c', color: 'white', padding: '10px' }}>保存</button>
                        </div>
                    </form>
                </div>
            </div>
        )}
      </div>

      <div
        className="resize-handle"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleResizeStart}
      />

      {/* 右側：詳細パネル領域 */}
      <div className="inspector-area">
        <div className="io-panel">
          <button className="btn btn-secondary" onClick={() => handleExportCsv('selected')}>
            選択部分をCSV
          </button>
          <button className="btn btn-secondary" onClick={() => handleExportCsv('all')}>
            全体をCSV
          </button>
          <button className="btn btn-secondary" onClick={handleImportClick}>
            CSVから追加
          </button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden-file-input"
            onChange={handleImportCsv}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            className={`btn ${nodeContentType === 'label' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleToggleContentType('label')}
          >
            タイトル表示
          </button>
          <button 
            className={`btn ${nodeContentType === 'formula' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleToggleContentType('formula')}
          >
            数式表示
          </button>
        </div>
        <button className="btn btn-add" onClick={handleAddNode}>
          + 新しい法則を追加
        </button>
        {selectedNode ? (
          <div>
          {isEditing ?(
            <div className="edit-form">
              <h3 className="inspector-title">編集モード</h3>
                
              <label>題名 (必須)</label>
              <input 
                type="text" 
                value={formData.label} 
                onChange={(e) => setFormData({...formData, label: e.target.value})}
              />

              <label>数式 (LaTeX / 必須)</label>
              <input 
                type="text" 
                value={formData.formula} 
                onChange={(e) => setFormData({...formData, formula: e.target.value})}
              />

              <label htmlFor="node-category">カテゴリー</label>
              <select
                id="node-category"
                name="category"
                value={formData.category || 'default'} // 初期値は'default'
                onChange={onChangeCategory}
                style={{ marginBottom: '10px' }}
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
                <option value="new-category" /*onClick={() => setIsCategoryModalOpen(true)}*/>
                  ▶ 新規カテゴリーを追加
                </option>
              </select>

              <label>説明・メモ</label>
              <DescriptionLatexEditor
                value={formData.description || ''}
                onChange={(description) => setFormData({...formData, description})}
              />

              <div className="action-buttons">
                <button className="btn btn-primary" onClick={handleSave}>保存</button>
                <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>キャンセル</button>
                <button className="btn btn-delete" onClick={handleDeleteNode}>削除</button>
              </div>
            </div>
            ) : (
            <div>
              <h2 className="inspector-title">{selectedNode.data.label}</h2>
              <div className="formula-box">
                <InlineMath math={selectedNode.data.formula} />
              </div>
              <div className="description-box">
                <h3>解説</h3>
                <DescriptionLatexView value={selectedNode.data.description || ''} />
                <div className="related-info-panel" style={{ marginTop: '20px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
                    <h4 style={{ marginBottom: '5px' }}>&gt;&gt;&gt; 導出元</h4>
                    {relatedNodesInfo.sources.length > 0 ? (
                        <ul style={{ listStyle: 'none', paddingLeft: '0' }}>
                            {relatedNodesInfo.sources.map((info, index) => (
                                <li key={index} style={{ marginBottom: '5px' }}>
                                    <InlineMath math={info.formula || ''} />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p style={{ fontStyle: 'italic', fontSize: '14px', color: '#666' }}>（導出元となる法則はありません）</p>
                    )}

                    <h4 style={{ marginBottom: '5px', marginTop: '15px' }}>&gt;&gt;&gt; 導出先</h4>
                    {relatedNodesInfo.targets.length > 0 ? (
                        <ul style={{ listStyle: 'none', paddingLeft: '0' }}>
                            {relatedNodesInfo.targets.map((info, index) => (
                                <li key={index} style={{ marginBottom: '5px' }}>
                                    <InlineMath math={info.formula || ''} />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p style={{ fontStyle: 'italic', fontSize: '14px', color: '#666' }}>（この法則から導かれる法則はありません）</p>
                    )}
                </div>
              </div>
              <div style={{marginTop: '20px'}}>
                <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
                  内容を編集
                </button>
              </div>
            </div>
          )}      
        </div>) : (
          <div className="empty-state">
            <p>ノードをクリックして<br/>詳細を表示</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App(){
  console.log("I am function App");
  return(
    <ReactFlowProvider>
      <PhysicsMapper/>
    </ReactFlowProvider>
  );
}
