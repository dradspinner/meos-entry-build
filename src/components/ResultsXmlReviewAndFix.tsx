import React, { useEffect, useState } from 'react';
import { Modal, Table, Tag, Button, Space, Typography, App } from 'antd';
import { CheckCircleOutlined, DatabaseOutlined, FileDoneOutlined } from '@ant-design/icons';
import { meosResultsValidationService, type ValidationBatch } from '../services/meosResultsValidationService';
import { runnerValidationService } from '../services/runnerValidationService';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  xmlContent: string;
  eventName: string;
  eventDate: string;
  onApplyXml: (correctedXml: string, savedPath?: string) => void;
  onDbUpdated?: (stats: { updated: number; created: number; skipped: number }) => void;
  savePath?: string | null;
}

const ResultsXmlReviewAndFix: React.FC<Props> = ({ open, onClose, xmlContent, eventName, eventDate, onApplyXml, onDbUpdated, savePath }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [batch, setBatch] = useState<ValidationBatch | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setLoading(true);
        const vb = await meosResultsValidationService.validateMeOSResultsXML(xmlContent, eventName, eventDate);
        setBatch(vb);
      } catch (e) {
        message.error('Failed to analyze XML');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, xmlContent, eventName, eventDate]);

  const summary = batch ? runnerValidationService.getValidationSummary(
    batch.validationResults.map(r => ({ valid: r.valid, diffs: r.diffs, suggestedCorrections: r.suggestedCorrections, matchedRunner: r.matchedRunner }))
  ) : null;

  const columns = [
    {
      title: 'Runner',
      key: 'name',
      render: (record: any) => (
        <Space direction="vertical" size={2}>
          <span>{record.runner.firstName} {record.runner.lastName}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.runner.club || <Text type="secondary" italic>(No club)</Text>}</Text>
        </Space>
      )
    },
    {
      title: 'Differences (Runner DB → XML)',
      key: 'diffs',
      render: (record: any) => (
        <Space wrap>
          {record.diffs
            .filter((d: any) => (d.type === 'entry_missing' || d.type === 'conflict'))
            .filter((d: any) => d.suggestedValue !== undefined && d.suggestedValue !== '' && d.suggestedValue !== 0)
            .map((d: any, idx: number) => (
              <Tag key={idx} color={d.type === 'entry_missing' ? 'blue' : 'red'}>
                {d.field}: {String(d.entryVal ?? '—')} ⇄ {String(d.suggestedValue ?? '—')}
              </Tag>
            ))}
        </Space>
      )
    },
  ];

  const applyAllToXml = async () => {
    if (!batch) return;
    try {
      setLoading(true);
      const corrected = meosResultsValidationService.applyCorrectionToXML(xmlContent, batch, 'all');
      let savedPath: string | undefined;
      if (savePath && (window as any).electron) {
        const outPath = savePath.replace(/\.xml$/i, '_corrected.xml');
        const ok = await (window as any).electron.saveFile(outPath, corrected);
        if (ok) savedPath = outPath;
      }
      onApplyXml(corrected, savedPath);
      message.success('Applied corrections to XML');
    } finally { setLoading(false); }
  };

  const updateDbFromEvent = async () => {
    if (!batch) return;
    try {
      setLoading(true);
      const stats = await meosResultsValidationService.updateRunnerDBFromBatch(batch);
      onDbUpdated?.(stats);
      message.success(`Runner DB updated: ${stats.updated} updated, ${stats.created} created`);
    } finally { setLoading(false); }
  };

  return (
    <Modal
      title={(<Space><FileDoneOutlined /> <span>Review XML vs Runner Database</span></Space>)}
      open={open}
      onCancel={onClose}
      width={1000}
      footer={(
        <Space>
          <Button onClick={updateDbFromEvent} disabled={!batch} loading={loading}>Update Runner DB</Button>
          <Button type="primary" onClick={applyAllToXml} disabled={!batch} loading={loading}>Apply All to XML</Button>
          <Button onClick={onClose}>Close</Button>
        </Space>
      )}
      confirmLoading={loading}
    >
      {summary && (
        <div style={{ marginBottom: 12 }}>
          <Text strong>Found {summary.invalidRunners} runners with differences</Text>
        </div>
      )}
      <Table
        dataSource={batch ? batch.validationResults : []}
        columns={columns as any}
        rowKey={(r: any) => r.runner.id}
        size="small"
        pagination={{ pageSize: 100, showSizeChanger: true }}
        loading={loading}
      />
    </Modal>
  );
};

export default ResultsXmlReviewAndFix;
