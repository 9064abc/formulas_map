import React, { useState, useCallback } from 'react';
import ReactFlow, { 
  Controls, 
  Background, 
  applyNodeChanges, 
  applyEdgeChanges,
  addEdge 
} from 'reactflow';
import 'reactflow/dist/style.css'; // React Flowの基本スタイル
import './App.css';

// --- 初期データ（ここを将来的にユーザー入力やJSON読み込みにする） ---
const initialNodes = [
  { 
    id: '1', 
    position: { x: 250, y: 50 }, 
    data: { 
      label: '運動方程式', 
      formula: 'F = ma', 
      description: '物体に働く力 F は、質量 m と加速度 a の積に等しい。ニュートン力学の基礎。' 
    },
    style: { background: '#E3F2FD', border: '1px solid #2196F3', width: 150 }
  },
  { 
    id: '2', 
    position: { x: 100, y: 200 }, 
    data: { 
      label: '加速度の定義', 
      formula: 'a = dv / dt', 
      description: '加速度 a は速度 v の時間微分である。' 
    },
    style: { background: '#FFEBEE', border: '1px solid #F44336', width: 150 }
  },
  { 
    id: '3', 
    position: { x: 400, y: 200 }, 
    data: { 
      label: '運動量保存則', 
      formula: 'p = mv (const)', 
      description: '外力が働かない場合、系の総運動量は保存される。' 
    },
    style: { background: '#E8F5E9', border: '1px solid #4CAF50', width: 150 }
  },
];

const initialEdges = [
  { id: 'e1-2', source: '2', target: '1', animated: true, label: '代入' },
  { id: 'e1-3', source: '1', target: '3', label: '積分' }
];

// --- メインコンポーネント ---
export default function App() {
  // ノードとエッジの状態管理
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  
  // 選択されたノードの情報を保持する状態
  const [selectedNodeData, setSelectedNodeData] = useState(null);

  // ノードがドラッグされた時の処理
  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  // エッジが変更された時の処理
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // ノード同士を手動でつないだ時の処理
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  // ノードをクリックした時の処理（詳細パネルへの表示）
  const onNodeClick = (event, node) => {
    setSelectedNodeData(node.data);
  };

  // 背景（キャンバス）をクリックしたら選択解除
  const onPaneClick = () => {
    setSelectedNodeData(null);
  };

  return (
    <div className="app-container">
      {/* 左側：マップ領域 */}
      <div className="canvas-area">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView // 初期表示時に全体が見えるように調整
        >
          <Background color="#aaa" gap={16} />
          <Controls />
        </ReactFlow>
      </div>

      {/* 右側：詳細パネル領域 */}
      <div className="inspector-area">
        {selectedNodeData ? (
          <div>
            <h2 className="inspector-title">{selectedNodeData.label}</h2>
            <div className="formula-box">
              {/* ここに将来 KaTeX を入れる */}
              {selectedNodeData.formula}
            </div>
            <div className="description-box">
              <h3>解説</h3>
              <p>{selectedNodeData.description}</p>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p>ノードをクリックして<br/>詳細を表示</p>
          </div>
        )}
      </div>
    </div>
  );
}