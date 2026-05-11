/*global Dingdocs*/

import { useEffect, useState } from 'react';
import { initView } from 'dingtalk-docs-cool-app';
import { Typography, Button, Card } from 'dingtalk-design-desktop';
import { getLocale, type Locales } from './locales';
import './style.css';

function extractErrorMsg(error: any): string {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message) return error.message;
  if (typeof error.reason === 'string' && error.reason) return error.reason;
  if (typeof error.error === 'string' && error.error) return error.error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

interface DocumentInfo {
  uuid: string;
  sheetsCount: number;
  currentSheet: string;
}

function App() {
  const [locale, setLocale] = useState<Locales>(getLocale('zh-CN'));
  const [loading, setLoading] = useState(false);
  const [documentInfo, setDocumentInfo] = useState<DocumentInfo | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(true);

  useEffect(() => {
    initView({
      onReady: async () => {
        try {
          const currentLocale = await Dingdocs.base.host.getLocale();
          setLocale(getLocale(currentLocale));
        } catch {
          // 使用默认语言
        }
        try {
          const info = await Dingdocs.script.run('getDocumentInfo');
          setDocumentInfo(info);
        } catch (e) {
          console.error('load doc info failed:', e);
        }
      },
    });
  }, []);

  const handleScheduleDate = async () => {
    if (!window.confirm(locale.confirmScheduleDate)) return;

    setLoading(true);
    setStatusMsg('');
    try {
      const result = await Dingdocs.script.run('scheduleDateButton');
      setIsSuccess(result.success !== false);
      setStatusMsg(result.message);
    } catch (error: any) {
      setIsSuccess(false);
      setStatusMsg(`${locale.operationFailed}: ${extractErrorMsg(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='page'>
      <div className='header'>
        <Typography.Text strong>{locale.title}</Typography.Text>
      </div>
      <div className='content'>

        {/* 安排日期按钮 - 置顶 */}
        <Card size={'small'} style={{ marginBottom: '12px' }}>
          <Button
            type="primary"
            size={'small'}
            disabled={loading}
            onClick={handleScheduleDate}
            style={{ width: '100%' }}
          >
            {loading ? locale.processing : locale.scheduleDateButton}
          </Button>
          {statusMsg && (
            <div style={{
              marginTop: '10px',
              fontSize: '12px',
              lineHeight: '1.6',
              color: isSuccess ? '#52c41a' : '#cf1322',
              wordBreak: 'break-all',
            }}>
              {statusMsg}
            </div>
          )}
        </Card>

        {/* 文档信息 */}
        {documentInfo && (
          <Card size={'small'} title={locale.documentInfo}>
            <div className="info-item">
              <Typography.Text>
                <strong>{locale.currentSheet}：</strong>{documentInfo.currentSheet}
              </Typography.Text>
            </div>
            <div className="info-item">
              <Typography.Text>
                <strong>{locale.totalSheets}：</strong>{documentInfo.sheetsCount}
              </Typography.Text>
            </div>
            <div className="info-item">
              <Typography.Text type={'secondary'} style={{ fontSize: '11px' }}>
                {locale.documentUuid}：{documentInfo.uuid}
              </Typography.Text>
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}

export default App;
