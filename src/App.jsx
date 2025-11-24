import React, { useState, useCallback, useEffect} from 'react';
import ReactFlow, { 
  Controls, 
  Background, 
  applyNodeChanges, 
  applyEdgeChanges,
  addEdge, 
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import 'reactflow/dist/style.css'; // React Flowの基本スタイル
import './App.css';

// --- 初期データ（ここを将来的にユーザー入力やJSON読み込みにする） ---
const flowKey = 'physics-mapper-flow';

const getInitialFlow = () => {
  if (typeof window === 'undefined') {
    // サーバーサイドレンダリング環境など、windowオブジェクトがない場合は初期データを返す
    return { 
      nodes: [], 
      edges: [],
      idCount: 1 
    };
  }
  
  const savedFlow = localStorage.getItem(flowKey);
  
  if (savedFlow) {
    const { nodes, edges, idCount } = JSON.parse(savedFlow);

    // IDカウンターの安全な初期化
    // 既存ノードの最大IDを求め、その次の番号から開始するようにする
    const maxId = nodes.reduce((max, node) => {
        const idNum = parseInt(node.id.split('-')[1]);
        return idNum > max ? idNum : max;
    }, 0);
    
    return {
      nodes: nodes,
      edges: edges,
      idCount: maxId > 0 ? maxId + 1 : 1 // 1からスタート
    };
  }

  // データがなければデフォルトの初期データを返す
  return {
    nodes: [
      { 
        id: 'node-1', position: { x: 250, y: 50 }, 
        data: { label: '運動方程式', formula: 'F = ma', description: '物体に働く力 F は、質量 m と加速度 a の積に等しい。', category: 'mechanics' },
        style: { background: '#E3F2FD', border: '1px solid #2196F3', width: 180 }
      },
      { 
        id: 'node-2', position: { x: 100, y: 250 }, 
        data: { label: '加速度の定義', formula: 'a = \\frac{dv}{dt}', description: '加速度 a は速度 v の時間微分である。', category: 'mechanics' },
        style: { background: '#E3F2FD', border: '1px solid #2196F3', width: 180 }
      },
    ],
    edges: [
      { id: 'e1-2', source: 'node-2', target: 'node-1', animated: true, label: '代入' }
    ],
    idCount: 3
  };
};

const categoryStyles = {
  mechanics: { background: '#E3F2FD', border: '1px solid #2196F3' }, // 青系
  electromagnetism: { background: '#FFEBEE', border: '1px solid #F44336' }, // 赤系
  thermodynamics: { background: '#FFF3E0', border: '1px solid #FF9800' }, // オレンジ系
  math: { background: '#F3E5F5', border: '1px solid #9C27B0' }, // 紫系
  default: { background: '#ffffff', border: '1px solid #777' }
};

// --- メインコンポーネント ---
function PhysicsMapper() {

  const initialFlow = getInitialFlow();

  //console.log("start physicsmapper");
  // ノードとエッジの状態管理
  const [nodes, setNodes] = useState(initialFlow.nodes);
  const [edges, setEdges] = useState(initialFlow.edges);
  const [idCount, setIdCount] = useState(initialFlow.idCount);
  
  // 選択されたノードの情報を保持する状態
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({label: '', formula: '', description: '', category: 'default'})
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());

  // React Flowのインスタンス操作用（画面中心取得のため）
  const { project, getViewport } = useReactFlow();

  useEffect(() => {
    // nodes, edges, idCount のいずれかが変更されたらローカルストレージに保存する
    const flowToSave = JSON.stringify({ nodes, edges, idCount });
    localStorage.setItem(flowKey, flowToSave);
  }, [nodes, edges, idCount]);

  // ノードがドラッグされた時の処理
  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)),[]);
  // エッジが変更された時の処理
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),[]);
  // ノード同士を手動でつないだ時の処理
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)),[]);

  // ノードをクリックした時の処理（詳細パネルへの表示）
  const onNodeClick = useCallback(
    (event, node) => {
      setSelectedNodeId(node.id);
      setFormData(node.data);
      setIsEditing(false);
      const newHighlightedNodes = new Set();
      newHighlightedNodes.add(node.id); // 自身を選択

      // 関連するエッジを検索し、関連ノードIDを収集
      edges.forEach(edge => {
        if (edge.source === node.id || edge.target === node.id) {
            newHighlightedNodes.add(edge.source);
            newHighlightedNodes.add(edge.target);
        }
      }
    );

    setHighlightedNodes(newHighlightedNodes);
    },
    [edges]
  );

  // 背景（キャンバス）をクリックしたら選択解除
  const onPaneClick = useCallback(
    () => {
      setSelectedNodeId(null);
      setIsEditing(false);
      setHighlightedNodes(new Set());
    },
    []
  );

  const handleAddNode = () => {
    // 現在の画面の中心座標を計算する
    const { x, y, zoom } = getViewport();
    // 画面中央（左側のキャンバスエリア）の大体の中心
    const centerX = (-x + (window.innerWidth - 300) / 2) / zoom;
    const centerY = (-y + window.innerHeight / 2) / zoom;

    const newId = `${idCount}`;
    const newNode = {
      id: newId,
      position: { x: centerX - 90, y: centerY - 50 }, // 中心から少しずらす（ノードの半分のサイズ分）
      data: { 
        label: '新しい法則', 
        formula: 'x = ?', 
        description: 'ここに説明を書く', 
        category: 'default' 
      },
      style: { ...categoryStyles.default, width: 150 }
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
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNodeId) {
          // カテゴリに応じて色も更新
          const style = categoryStyles[formData.category] || categoryStyles.default;
          return {
            ...node,
            data: { ...formData },
            style: { ...style, width: 180 }
          };
        }
        return node;
      })
    );
    setIsEditing(false); // 閲覧モードに戻る
  };

  const onEdgeDoubleClick = useCallback((event, edge) => {
    // ダブルクリックしたエッジをedges配列からフィルタリングして削除
    setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    // 標準のブラウザメニューが開かないように阻止
    event.preventDefault(); 
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const styledNodes = nodes.map(node => {
    // ノードがハイライトされているか確認
    const isHighlighted = highlightedNodes.size === 0 || highlightedNodes.has(node.id);
    
    // スタイルをコピー
    const style = { ...node.style };

    // ハイライトされていないノードは透明度を低くする
    if (!isHighlighted) {
        style.opacity = 0.3;
    } else {
        style.opacity = 1;
    }

    return { ...node, style };
  });
  
  // エッジも同様にスタイルを適用する（ハイライトされていないエッジは薄くする）
  const styledEdges = edges.map(edge => {
    const isHighlighted = highlightedNodes.size === 0 || 
                          (highlightedNodes.has(edge.source) && highlightedNodes.has(edge.target));
    
    const style = {
        strokeWidth: isHighlighted ? 2 : 1,
        stroke: isHighlighted ? '#222' : '#999',
        opacity: isHighlighted ? 1 : 0.2
    };

    return { ...edge, style };
  });

  return (
    <div className="app-container">
      {/* 左側：マップ領域 */}
      <div className="canvas-area">
        <ReactFlow
          nodes={styledNodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          fitView // 初期表示時に全体が見えるように調整
        >
          <Background color="#aaa" gap={16} />
          <Controls />
        </ReactFlow>
      </div>

      {/* 右側：詳細パネル領域 */}
      <div className="inspector-area">
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

              <label>カテゴリー</label>
              <select  value={formData.category}  onChange={(e) => setFormData({...formData, category: e.target.value})}>
                <option value="default">未分類</option>
                <option value="mechanics">力学</option>
                <option value="electromagnetism">電磁気学</option>
                <option value="thermodynamics">熱力学</option>
                <option value="math">数学・定義</option>
              </select>

              <label>説明・メモ</label>
              <textarea  value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
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
                <p>{selectedNode.data.description}</p>
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