# Firestore ORM プロジェクト

## 概要
FirestoreのORMライブラリを開発しています。
- **Documentパターン**: ActiveRecordパターン
- **Collectionパターン**: Repositoryパターン
- **対応環境**: Hosting及びFunctionsで共通化（firebase/firebase-admin両対応）

## プロジェクト構成

```
/home/mizushino/firestore-orm/
├── old/                    # 旧バージョン（参考実装）
│   ├── document.ts        # FirestoreDocument (ActiveRecord)
│   ├── collection.ts      # FirestoreCollection (Repository)
│   ├── query.ts           # クエリビルダー
│   └── firestore.ts       # Firestore初期化・トランザクション
├── firestore/             # 共通のFirestoreデータ定義
├── hosting/               # フロントエンド（Hosting）実装
└── functions/             # バックエンド（Functions）実装
```

## 旧実装（old/）の設計分析

### 1. FirestoreDocument (ActiveRecord)
**ファイル**: [old/document.ts](old/document.ts)

#### 主要機能
- **CRUD操作**: load, save, delete
- **リアルタイム更新**: snapshot, onSnapshot, cancelSnapshot
- **差分管理**: Proxyによる変更追跡、updatedマップで差分を記録
- **シリアライゼーション**: Date→Timestamp変換、ネストオブジェクト対応
- **バッチ操作**: batchSave, batchDelete (500件チャンク)
- **トランザクション**: Transaction/WriteBatch対応

#### 特徴
```typescript
// 使用例
class User extends FirestoreDocument<UserKey, UserData> {
  static ref(key: UserKey) {
    return doc(collection(firestore(), 'users'), key.id);
  }
}

const user = new User({ id: 'user1' });
await user.load();
user.data.name = 'John';  // Proxy経由で変更追跡
await user.save();  // 差分のみ更新
```

### 2. FirestoreCollection (Repository)
**ファイル**: [old/collection.ts](old/collection.ts)

#### 主要機能
- **クエリ**: Condition型でwhere/orderBy/limit等を指定
- **CRUD操作**: load, add, set, delete
- **リアルタイム更新**: snapshot, onSnapshot
- **ドキュメント管理**: Map<string, Document>でキャッシュ
- **ID生成**: newId (ランダム), timeId (タイムスタンプベース)

#### 特徴
```typescript
// 使用例
class UserCollection extends FirestoreCollection<UserKey, UserData, User> {
  static ref(key: UserKey) {
    return collection(firestore(), 'users');
  }
}

const users = new UserCollection(User, undefined, {
  where: [{ fieldPath: 'age', opStr: '>=', value: 20 }],
  limit: 10
});
await users.load();
for (const user of users.documents.values()) {
  console.log(user.data);
}
```

### 3. Query Builder
**ファイル**: [old/query.ts](old/query.ts)

```typescript
interface Condition {
  where?: Where[];
  limit?: number;
  limitToLast?: number;
  orderBy?: { fieldPath: string | FieldPath; directionStr?: OrderByDirection };
  startAfter?: DocumentSnapshot;
  startAt?: DocumentSnapshot;
  endBefore?: DocumentSnapshot;
  endAt?: DocumentSnapshot;
}
```

### 4. Firestore初期化
**ファイル**: [old/firestore.ts](old/firestore.ts)

- `getFirestore()`: firebase/firestoreラッパー
- `runTransaction()`: トランザクションヘルパー
- エミュレーター対応（コメントアウト済み）

## 新実装の要件

### 1. firebase/firebase-admin両対応
- **firestore/**: 共通のデータ型定義・インターフェース
- **hosting/**: `firebase/firestore`を使用（フロントエンド）
- **functions/**: `firebase-admin/firestore`を使用（バックエンド）

### 2. 改善ポイント
- TypeScript型安全性の強化
- エラーハンドリングの改善
- テストコードの追加
- ドキュメントの充実

### 3. 実装方針
1. **共通データ定義**: `firestore/`に型定義・データモデル
2. **環境別実装**:
   - `hosting/`: firebase SDKを使ったフロントエンド実装
   - `functions/`: firebase-admin SDKを使ったバックエンド実装
3. **互換性維持**: 旧APIとの互換性を保つ

## 開発タスク

### Phase 1: 共通データ定義 (firestore/)
- [ ] 型定義 (FirestoreKey, FirestoreData)
- [ ] データモデル定義
- [ ] 共通インターフェース

### Phase 2: Hosting実装 (hosting/)
- [ ] FirestoreDocumentクラス (firebase SDK)
- [ ] FirestoreCollectionクラス
- [ ] Query Builder
- [ ] Firestore初期化

### Phase 3: Functions実装 (functions/)
- [ ] FirestoreDocumentクラス (firebase-admin SDK)
- [ ] FirestoreCollectionクラス
- [ ] Query Builder
- [ ] Firestore初期化

### Phase 4: テスト・ドキュメント
- [ ] ユニットテスト
- [ ] 統合テスト
- [ ] API ドキュメント
- [ ] 使用例

## 設計上の注意点

### Proxy使用
- Documentの変更追跡にProxyを使用
- パフォーマンス影響に注意

### リアルタイム更新
- snapshotのメモリリーク防止
- AsyncQueue実装の見直し

### バッチ処理
- 500件制限の考慮
- エラーハンドリング

### トランザクション
- Transaction/WriteBatchの適切な使い分け
- Retry処理

## 参考コード

### 旧実装の主要クラス
1. **FirestoreDocument**: [old/document.ts:33](old/document.ts#L33)
2. **FirestoreCollection**: [old/collection.ts:23](old/collection.ts#L23)
3. **buildQuery**: [old/query.ts:25](old/query.ts#L25)
4. **getFirestore**: [old/firestore.ts:29](old/firestore.ts#L29)

### 重要なメソッド
- Document.load(): [old/document.ts:225](old/document.ts#L225)
- Document.save(): [old/document.ts:255](old/document.ts#L255)
- Collection.load(): [old/collection.ts:151](old/collection.ts#L151)
- Collection.snapshot(): [old/collection.ts:261](old/collection.ts#L261)
