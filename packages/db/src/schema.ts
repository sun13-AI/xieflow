// 协流 XieFlow — schema.ts：建表 SQL 与迁移（user_version 版本管理）
// 宪法第七条：schema 变更只走这里，禁止手改库文件。
import type { Migration } from "@xieflow/shared";
import { SCHEMA_VERSION } from "@xieflow/shared";

/** 全量迁移队列，按 version 升序；新迁移追加到尾部，永不修改旧条目 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "r1 · settings 表",
    up: [
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: "r1 · todos 表（数据层先行，UI r2 落）",
    up: [
      `CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        quadrant TEXT NOT NULL CHECK (quadrant IN ('q1','q2','q3','q4')),
        status TEXT NOT NULL CHECK (status IN ('open','done','archived')),
        due_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_todos_quadrant ON todos (quadrant)`,
      `CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos (due_date)`,
    ],
  },
  {
    version: 3,
    name: "r3 · schedules 表（日程与待办双向联动）",
    up: [
      `CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        todo_id INTEGER REFERENCES todos(id) ON DELETE CASCADE,
        repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none','daily','weekly','monthly')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules (date)`,
      `CREATE INDEX IF NOT EXISTS idx_schedules_todo_id ON schedules (todo_id)`,
    ],
  },
  {
    version: 4,
    name: "r4 · projects / board_columns / cards 表（项目与看板数据层）",
    up: [
      `CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS board_columns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_board_columns_project ON board_columns (project_id)`,
      `CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        column_id INTEGER NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        position INTEGER NOT NULL,
        todo_id INTEGER REFERENCES todos(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_cards_column ON cards (column_id)`,
      `CREATE INDEX IF NOT EXISTS idx_cards_project ON cards (project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_cards_todo_id ON cards (todo_id)`,
    ],
  },
  {
    version: 5,
    name: "r6 · tables / fields / records 表（多维表格字段引擎 + 网格视图）",
    up: [
      `CREATE TABLE IF NOT EXISTS tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS fields (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('text','number','date','select','multi-select','checkbox','url')),
        position INTEGER NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_fields_table ON fields (table_id)`,
      `CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
        data TEXT NOT NULL DEFAULT '{}',
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_records_table ON records (table_id)`,
    ],
  },
  {
    version: 6,
    name: "r7 · views 表（视图持久化：筛选 / 排序 / 字段可见性）",
    up: [
      `CREATE TABLE IF NOT EXISTS views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        filter_spec TEXT NOT NULL DEFAULT '[]',
        sort_spec TEXT NOT NULL DEFAULT '[]',
        visible_fields TEXT NOT NULL DEFAULT '[]',
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_views_table ON views (table_id)`,
    ],
  },
  {
    version: 7,
    name: "r8 · documents / blocks 表（文档块编辑器：块类型 / 顺序 / 内容 JSON / 可空父块）",
    up: [
      `CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('paragraph','heading1','heading2','heading3','bullet','numbered','todo','quote','code','divider')),
        position INTEGER NOT NULL,
        content TEXT NOT NULL DEFAULT '{}',
        parent_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_blocks_document ON blocks (document_id)`,
      `CREATE INDEX IF NOT EXISTS idx_blocks_parent ON blocks (parent_id)`,
    ],
  },
  {
    version: 8,
    name: "r9 · conversations / messages / artifacts 表（M5 AI 工作台对话与工具调用框架）",
    up: [
      `CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK (length(title) > 0),
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user','assistant','tool')),
        content_json TEXT NOT NULL DEFAULT '{}',
        tool_calls_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id)`,
      `CREATE TABLE IF NOT EXISTS artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_artifacts_conversation ON artifacts (conversation_id)`,
    ],
  },
  {
    version: 9,
    name: "r12 · knowledge_docs / knowledge_chunks 表（M6 知识库入库与检索）",
    up: [
      `CREATE TABLE IF NOT EXISTS knowledge_docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK (length(title) > 0),
        source_type TEXT NOT NULL CHECK (source_type IN ('text','document')),
        source_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_docs_source_type ON knowledge_docs (source_type)`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_docs_source_id ON knowledge_docs (source_id)`,
      `CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        vector TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON knowledge_chunks (doc_id)`,
    ],
  },
  {
    version: 10,
    name: "r14 · mindmaps 表（M7 第 1 片：思维导图 Markdown 双视图）",
    up: [
      `CREATE TABLE IF NOT EXISTS mindmaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK (length(title) > 0),
        content_markdown TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 11,
    name: "r15 · whiteboards / whiteboard_items 表（M7 第 2 片：白板画布与 AI 建板）",
    up: [
      `CREATE TABLE IF NOT EXISTS whiteboards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK (length(title) > 0),
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS whiteboard_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('note','text','shape')),
        x REAL NOT NULL,
        y REAL NOT NULL,
        w REAL NOT NULL,
        h REAL NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_whiteboard_items_board ON whiteboard_items (board_id)`,
    ],
  },
  {
    version: 12,
    name: "r16 · approvals / approval_steps / approval_cc 表（M8 第 1 片：审批流引擎）",
    up: [
      `CREATE TABLE IF NOT EXISTS approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK (length(title) > 0),
        type TEXT NOT NULL CHECK (type IN ('leave','expense','purchase','other')),
        applicant_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft','pending','approved','rejected','withdrawn')),
        current_assignee TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals (status)`,
      `CREATE INDEX IF NOT EXISTS idx_approvals_assignee ON approvals (current_assignee)`,
      `CREATE INDEX IF NOT EXISTS idx_approvals_applicant ON approvals (applicant_id)`,
      `CREATE TABLE IF NOT EXISTS approval_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        approval_id INTEGER NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
        "order" INTEGER NOT NULL,
        assignee TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('submit','approve','reject','delegate','withdraw')),
        comment TEXT NOT NULL DEFAULT '',
        acted_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_approval_steps_approval ON approval_steps (approval_id)`,
      `CREATE TABLE IF NOT EXISTS approval_cc (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        approval_id INTEGER NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
        cc_user TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (approval_id, cc_user)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_approval_cc_approval ON approval_cc (approval_id)`,
    ],
  },
  {
    version: 13,
    name: "r17 · assets / asset_transactions / unit_tasks 表（M8 第 2 片：物资台账与单位任务流转）",
    up: [
      `CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(name) > 0),
        category TEXT NOT NULL CHECK (category IN ('office','equipment','material','furniture','other')),
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        unit TEXT NOT NULL,
        location TEXT NOT NULL,
        custodian TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_assets_category ON assets (category)`,
      `CREATE TABLE IF NOT EXISTS asset_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('in','out','transfer')),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        "from" TEXT NOT NULL DEFAULT '',
        "to" TEXT NOT NULL DEFAULT '',
        operator TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_asset_transactions_asset ON asset_transactions (asset_id)`,
      `CREATE TABLE IF NOT EXISTS unit_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK (length(title) > 0),
        assignee_unit TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','in_progress','blocked','done','cancelled')),
        due_date TEXT,
        parent_id INTEGER REFERENCES unit_tasks(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_unit_tasks_status ON unit_tasks (status)`,
      `CREATE INDEX IF NOT EXISTS idx_unit_tasks_parent ON unit_tasks (parent_id)`,
    ],
  },
  {
    version: 14,
    name: "r18 · users / sessions 表（M9 起步：账号与本地会话认证）",
    up: [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`,
    ],
  },
  {
    version: 15,
    name: "r19 · change_log / entity_versions 表（M9 收官：多端同步与乐观锁冲突）",
    up: [
      `CREATE TABLE IF NOT EXISTS change_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('create','update','delete')),
        payload TEXT NOT NULL DEFAULT '{}',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        version INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_change_log_entity ON change_log (entity_type, entity_id)`,
      `CREATE INDEX IF NOT EXISTS idx_change_log_version ON change_log (entity_type, entity_id, version)`,
      `CREATE TABLE IF NOT EXISTS entity_versions (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (entity_type, entity_id)
      )`,
    ],
  },
  {
    version: 16,
    name: "r23 · departments / members 表（M10 后补强：组织架构与通讯录）",
    up: [
      `CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(name) > 0),
        parent_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE (name)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments (parent_id)`,
      `CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(name) > 0),
        department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
        role TEXT NOT NULL DEFAULT 'member',
        email TEXT NOT NULL CHECK (length(email) > 0),
        phone TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_members_department ON members (department_id)`,
      `CREATE INDEX IF NOT EXISTS idx_members_user ON members (user_id)`,
    ],
  },
  {
    version: 17,
    name: "r24 · 审批/物资可选 member_id 关联列（向后兼容，原文本列不动）",
    up: [
      `CREATE INDEX IF NOT EXISTS idx_approvals_applicant_member ON approvals (applicant_member_id)`,
      `CREATE INDEX IF NOT EXISTS idx_approval_steps_assignee_member ON approval_steps (assignee_member_id)`,
      `CREATE INDEX IF NOT EXISTS idx_approval_cc_member ON approval_cc (cc_member_id)`,
      `CREATE INDEX IF NOT EXISTS idx_assets_custodian_member ON assets (custodian_member_id)`,
    ],
    ensureColumns: [
      { table: "approvals", column: "applicant_member_id", sql: `ALTER TABLE approvals ADD COLUMN applicant_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL` },
      { table: "approval_steps", column: "assignee_member_id", sql: `ALTER TABLE approval_steps ADD COLUMN assignee_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL` },
      { table: "approval_cc", column: "cc_member_id", sql: `ALTER TABLE approval_cc ADD COLUMN cc_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL` },
      { table: "assets", column: "custodian_member_id", sql: `ALTER TABLE assets ADD COLUMN custodian_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL` },
    ],
  },
  {
    version: 18,
    name: "r25 · 审批动作操作人关联列（向后兼容，原文本列与 r24 四列不动）",
    up: [
      `CREATE INDEX IF NOT EXISTS idx_approval_steps_actor_member ON approval_steps (actor_member_id)`,
    ],
    ensureColumns: [
      { table: "approval_steps", column: "actor_member_id", sql: `ALTER TABLE approval_steps ADD COLUMN actor_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL` },
    ],
  },
  {
    version: 19,
    name: "r26 · notifications 表（站内消息聚合：类型 / 未读 / 引用 / 索引）",
    up: [
      `CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('schedule_due','approval_pending','asset_low','sync_conflict','system')),
        title TEXT NOT NULL CHECK (length(title) > 0),
        body TEXT NOT NULL DEFAULT '',
        ref_type TEXT NOT NULL CHECK (ref_type IN ('schedules','approvals','assets','sync','system')),
        ref_id INTEGER NOT NULL DEFAULT 0 CHECK (ref_id >= 0),
        read_at TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications (type)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications (read_at)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_ref ON notifications (ref_type, ref_id)`,
    ],
  },
  {
    version: 20,
    name: "r28 · rooms / meetings / meeting_attendees 表（会议管理与会议室预约：本地台账，不接视频/外部日历）",
    up: [
      `CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(name) > 0),
        location TEXT NOT NULL DEFAULT '',
        capacity INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_rooms_active ON rooms (active)`,
      `CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(title) > 0),
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        organizer TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_meetings_room_date ON meetings (room_id, date)`,
      `CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings (date)`,
      `CREATE TABLE IF NOT EXISTS meeting_attendees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        UNIQUE (meeting_id, member_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting ON meeting_attendees (meeting_id)`,
    ],
  },
  {
    version: 21,
    name: "r29 · document_versions 表 + documents.deleted_at 列（版本历史与回收站，不接实时协同）",
    up: [
      `CREATE TABLE IF NOT EXISTS document_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        version INTEGER NOT NULL CHECK (version > 0),
        title TEXT NOT NULL,
        content_markdown TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        UNIQUE (document_id, version)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions (document_id)`,
    ],
    ensureColumns: [
      { table: "documents", column: "deleted_at", sql: `ALTER TABLE documents ADD COLUMN deleted_at TEXT` },
    ],
  },
  {
    version: 22,
    name: "r30 · fields.type 扩 formula（多维表格公式字段，options JSON 内 expression，读时计算不落库）",
    // SQLite 无法 ALTER CHECK：重建 fields 表并逐列原样拷贝（id/值/时间逐字不动），
    // 只把 type 的 CHECK 白名单从 7 种扩为 8 种；无新表、既有字段零改动。
    // fields 无入向外键（records/views 只引用 tables），重建安全可靠。
    up: [
      `DROP INDEX IF EXISTS idx_fields_table`,
      `ALTER TABLE fields RENAME TO fields_v21`,
      `CREATE TABLE fields (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
         name TEXT NOT NULL,
         type TEXT NOT NULL CHECK (type IN ('text','number','date','select','multi-select','checkbox','url','formula')),
         position INTEGER NOT NULL,
         options TEXT NOT NULL DEFAULT '[]',
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      `INSERT INTO fields (id, table_id, name, type, position, options, created_at, updated_at)
       SELECT id, table_id, name, type, position, options, created_at, updated_at FROM fields_v21`,
      `DROP TABLE fields_v21`,
      `CREATE INDEX IF NOT EXISTS idx_fields_table ON fields (table_id)`,
    ],
  },
];

/** 当前 schema 版本（与 shared 的 SCHEMA_VERSION 保持一致，e2e 会断言二者相等） */
export const CURRENT_SCHEMA_VERSION: number = SCHEMA_VERSION;

/**
 * 确保迁移队列覆盖到目标版本且 version 连续。
 * 参数默认用真实队列；e2e 传入构造的坏队列验证校验逻辑本身（真实行为断言）。
 */
export function assertMigrationsConsistent(
  queue: readonly Migration[] = MIGRATIONS,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): void {
  const versions = queue.map((m) => m.version);
  const max = versions.length > 0 ? Math.max(...versions) : 0;
  if (max !== targetVersion) {
    throw new Error(
      `迁移队列最高版本 ${max} 与 SCHEMA_VERSION ${targetVersion} 不一致`,
    );
  }
  for (let i = 0; i < versions.length; i++) {
    if (versions[i] !== i + 1) {
      throw new Error(`迁移版本必须从 1 连续递增，第 ${i} 个是 ${versions[i]}`);
    }
  }
}
