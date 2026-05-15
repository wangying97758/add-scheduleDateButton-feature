export interface Locales {
  title: string;
  documentInfo: string;
  currentSheet: string;
  totalSheets: string;
  documentUuid: string;
  scheduleDateButton: string;
  confirmScheduleDate: string;
  operationFailed: string;
  processing: string;
  authError: string;
}

export const locales: Record<string, Locales> = {
  'zh-CN': {
    title: 'AI表格 - 安排日期',
    documentInfo: '文档信息',
    currentSheet: '当前数据表',
    totalSheets: '数据表总数',
    documentUuid: '文档UUID',
    scheduleDateButton: '安排日期',
    confirmScheduleDate: '确认安排日期？将按【节点刷新条件】列，仅刷新有填写该字段的行，推算至指定节点（含）为止。操作不可撤销，请确认。',
    operationFailed: '操作失败',
    processing: '处理中...',
    authError: '插件鉴权失败，请检查后台服务配置（DINGTALK_APPSECRET等环境变量）后重新加载页面。',
  },
  'en-US': {
    title: 'AI Table - Schedule Dates',
    documentInfo: 'Document Info',
    currentSheet: 'Current Sheet',
    totalSheets: 'Total Sheets',
    documentUuid: 'Document UUID',
    scheduleDateButton: '安排日期',
    confirmScheduleDate: 'Confirm schedule dates? Only rows with [Node Refresh Condition] filled will be updated, calculated up to the specified node (inclusive). This action cannot be undone.',
    operationFailed: 'Operation failed',
    processing: 'Processing...',
    authError: 'Plugin auth failed. Please check backend config (DINGTALK_APPSECRET etc.) and reload.',
  },
  'ja-JP': {
    title: 'AIテーブル - 日付設定',
    documentInfo: 'ドキュメント情報',
    currentSheet: '現在のシート',
    totalSheets: 'シート総数',
    documentUuid: 'ドキュメントUUID',
    scheduleDateButton: '安排日期',
    confirmScheduleDate: '日付の設定を確認しますか？【ノードリフレッシュ条件】が入力された行のみ、指定ノードまで（含む）逆算します。この操作は元に戻せません。',
    operationFailed: '操作に失敗しました',
    processing: '処理中...',
    authError: 'プラグイン認証に失敗しました。バックエンド設定を確認してページを再読み込みしてください。',
  },
};

export function getLocale(locale: string): Locales {
  return locales[locale] || locales['zh-CN'];
}
