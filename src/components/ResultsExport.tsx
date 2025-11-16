import React, { useState } from 'react';
import { Card, Button, Upload, Space, Alert, Typography, Progress, Radio, Table, Modal, Tag, App } from 'antd';
import { UploadOutlined, FileTextOutlined, CheckCircleOutlined, GlobalOutlined, WarningOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { resultsExportService } from '../services/resultsExportService';
import { meosResultsValidationService, type ValidationBatch } from '../services/meosResultsValidationService';
import { runnerValidationService } from '../services/runnerValidationService';
import ResultsReviewAndFix from './ResultsReviewAndFix';
import ResultsXmlReviewAndFix from './ResultsXmlReviewAndFix';

const { Title, Text, Paragraph } = Typography;

interface GenerationResult {
  success: boolean;
  resultsPath?: string;
  splitsPath?: string;
  error?: string;
}

type EventSource = 'MeOS' | 'OE12' | 'unknown';
type ValidationStep = 'source' | 'validate' | 'review' | 'generate';

const ResultsExport: React.FC = () => {
  const { message } = App.useApp();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [eventInfo, setEventInfo] = useState<{ name: string; date: string } | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('');
  const [eventSource, setEventSource] = useState<EventSource>('unknown');
  const [currentStep, setCurrentStep] = useState<ValidationStep>('source');
  const [validationBatch, setValidationBatch] = useState<ValidationBatch | null>(null);
  const [showValidationReport, setShowValidationReport] = useState(false);
  const [correctedXML, setCorrectedXML] = useState<string>('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [xmlReviewOpen, setXmlReviewOpen] = useState(false);
  const [xmlValidationReady, setXmlValidationReady] = useState(false);

  const handleBrowseFile = async () => {
    if (!window.electronAPI) {
      message.error('File dialog only available in Electron app');
      return;
    }

    setLoading(true);
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: 'Select OE12 XML Results File',
        filters: [
          { name: 'XML Files', extensions: ['xml'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        const selectedFileName = selectedPath.split(/[\\/]/).pop() || '';
        
        // Read file content
        const fileResult = await window.electronAPI.readFile(selectedPath);
        
        if (fileResult.success && fileResult.content) {
          setFilePath(selectedPath);
          setFileName(selectedFileName);
          setFileContent(fileResult.content);
          
          // Create a dummy file list entry for display
          setFileList([{
            uid: '-1',
            name: selectedFileName,
            status: 'done',
            url: selectedPath
          } as any]);
          
          // Parse XML to extract event info
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(fileResult.content, 'text/xml');
          
          const eventName = xmlDoc.querySelector('Event > Name')?.textContent?.trim() || 'Event Results';
          const eventDate = xmlDoc.querySelector('Event > StartTime > Date')?.textContent?.trim() || new Date().toISOString().split('T')[0];
          
          setEventInfo({ name: eventName, date: eventDate });
          setResult(null);
          setCurrentStep('source');
          setEventSource('unknown');
          setValidationBatch(null);
          setCorrectedXML('');
          
          message.success(`File loaded: ${selectedFileName}`);
        } else {
          message.error('Failed to read file');
        }
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      message.error('Failed to select file');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    setLoading(true);
    setResult(null);
    setEventInfo(null);

    try {
      // Read file content using FileReader
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
      });
      
      // Store content and filename
      setFileContent(content);
      setFileName(file.name);
      
      // Parse XML to extract event info
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, 'text/xml');
      
      const eventName = xmlDoc.querySelector('Event > Name')?.textContent?.trim() || 'Event Results';
      const eventDate = xmlDoc.querySelector('Event > StartTime > Date')?.textContent?.trim() || new Date().toISOString().split('T')[0];
      
      setEventInfo({ name: eventName, date: eventDate });
      setCurrentStep('source');
      setEventSource('unknown');
      setValidationBatch(null);
      setCorrectedXML('');
      
      message.success(`File loaded: ${file.name}`);
    } catch (error) {
      console.error('Error reading file:', error);
      message.error('Failed to read XML file');
    } finally {
      setLoading(false);
    }

    return false; // Prevent auto upload
  };

  const handleSelectEventSource = async (source: EventSource) => {
    setEventSource(source);
    setCurrentStep('validate');
    setLoading(true);

    try {
      if (source === 'MeOS') {
        // Validate by fetching competitors directly from MeOS API
        const validationBatch = await meosResultsValidationService.validateFromMeOSAPI(
          eventInfo?.name || 'Event',
          eventInfo?.date || new Date().toISOString().split('T')[0]
        );

        setValidationBatch(validationBatch);
        setCurrentStep('review');
        setReviewOpen(true);
        message.success(`Validated ${validationBatch.runners.length} runners from MeOS (live)`);
      } else if (source === 'unknown') {
        setCurrentStep('generate');
      } else if (source === 'OE12') {
        if (!fileContent) {
          message.warning('Please select an OE12 XML file first');
          setCurrentStep('source');
          return;
        }
        // For OE12, parse and validate against club database
        const classResults = resultsExportService.parseOE12XML(fileContent);
        
        // Extract runners from class results
        const runners = classResults.flatMap(cr => 
          cr.runners.map(r => ({
            firstName: r.name.split(' ')[0],
            lastName: r.name.split(' ').slice(1).join(' '),
            club: r.club,
            cardNumber: r.runTime
          }))
        );

        // Validate each runner
        const validationResults = runnerValidationService.validateRunners(
          runners.map((r, idx) => ({
            ...r,
            birthYear: undefined,
            sex: undefined,
            phone: undefined
          }))
        );

        const summary = runnerValidationService.getValidationSummary(
          validationResults.map(r => ({
            valid: r.valid,
            diffs: r.diffs,
            suggestedCorrections: r.suggestedCorrections
          }))
        );

        message.success(`Validated ${summary.totalRunners} runners (${summary.invalidRunners} need corrections)`);
        setCurrentStep('review');
      }
    } catch (error) {
      console.error('Validation error:', error);
      message.error('Failed to validate runners');
      setCurrentStep('source');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCorrections = async (autoFixLevel: 'none' | 'info' | 'warning' | 'all' = 'all') => {
    if (!validationBatch || !fileContent) return;

    try {
      const corrected = meosResultsValidationService.applyCorrectionToXML(
        fileContent,
        validationBatch,
        autoFixLevel
      );
      
      setCorrectedXML(corrected);
      setCurrentStep('generate');
      message.success('Corrections applied. Ready to generate results.');
    } catch (error) {
      console.error('Correction error:', error);
      message.error('Failed to apply corrections');
    }
  };

  const handleGenerateHTML = async () => {
    if (fileList.length === 0 || !fileContent) {
      message.warning('Please select an XML file first');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // Use corrected XML if available, otherwise use original
      const xmlToUse = correctedXML || fileContent;
      
      // Parse XML using stored content
      const classResults = resultsExportService.parseOE12XML(xmlToUse);

      if (!eventInfo) {
        throw new Error('Event information not loaded');
      }

      // Generate Results HTML
      const resultsHtml = resultsExportService.generateResultsByClassHTML(
        classResults,
        eventInfo.name,
        eventInfo.date
      );

      // Generate Splits HTML
      const splitsHtml = resultsExportService.generateSplitsHTML(
        classResults,
        eventInfo.name,
        eventInfo.date
      );

      // Determine output paths (same directory as input file)
      const resultsOutputPath = filePath.replace(/\.xml$/i, '_results.html');
      const splitsOutputPath = filePath.replace(/\.xml$/i, '_splits.html');

      // Save files using Electron API
      if (window.electron) {
        const resultsSaved = await window.electron.saveFile(resultsOutputPath, resultsHtml);
        const splitsSaved = await window.electron.saveFile(splitsOutputPath, splitsHtml);
        
        if (resultsSaved && splitsSaved) {
          setResult({
            success: true,
            resultsPath: resultsOutputPath,
            splitsPath: splitsOutputPath
          });
          message.success('Results and Splits HTML generated successfully!');
        } else {
          throw new Error('Failed to save one or more files');
        }
      } else {
        // Fallback for browser: download files
        // Download results
        const resultsBlob = new Blob([resultsHtml], { type: 'text/html' });
        const resultsUrl = URL.createObjectURL(resultsBlob);
        const resultsLink = document.createElement('a');
        resultsLink.href = resultsUrl;
        resultsLink.download = fileName.replace(/\.xml$/i, '_results.html');
        document.body.appendChild(resultsLink);
        resultsLink.click();
        document.body.removeChild(resultsLink);
        URL.revokeObjectURL(resultsUrl);

        // Download splits
        const splitsBlob = new Blob([splitsHtml], { type: 'text/html' });
        const splitsUrl = URL.createObjectURL(splitsBlob);
        const splitsLink = document.createElement('a');
        splitsLink.href = splitsUrl;
        splitsLink.download = fileName.replace(/\.xml$/i, '_splits.html');
        document.body.appendChild(splitsLink);
        splitsLink.click();
        document.body.removeChild(splitsLink);
        URL.revokeObjectURL(splitsUrl);

        setResult({
          success: true,
          resultsPath: resultsLink.download,
          splitsPath: splitsLink.download
        });
        message.success('Results and Splits HTML downloaded!');
      }
    } catch (error) {
      console.error('Error generating HTML:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate HTML'
      });
      message.error('Failed to generate results HTML');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenResults = () => {
    if (result?.resultsPath && window.electron) {
      window.electron.openExternal(result.resultsPath);
    }
  };

  const handleOpenSplits = () => {
    if (result?.splitsPath && window.electron) {
      window.electron.openExternal(result.splitsPath);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Header */}
          <div>
            <Title level={2}>
              <GlobalOutlined /> Post Results Online
            </Title>
            <Paragraph type="secondary">
              Import OE12 XML results file and generate professional HTML pages for your club website.
            </Paragraph>
          </div>

          {/* Step 1: Quick Clean MeOS (optional) */}
          <Card type="inner" title="1. Quick Clean MeOS (optional)">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Paragraph type="secondary">Fix live MeOS entries using your Runner Database before exporting. This does not modify any XML.</Paragraph>
              <Button type="primary" onClick={() => handleSelectEventSource('MeOS')} disabled={loading}>Review & Fix in MeOS</Button>
            </Space>
          </Card>

          {/* File Upload */}
          <Card type="inner" title="2. Select Results XML File">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button 
                icon={<UploadOutlined />} 
                onClick={handleBrowseFile}
                disabled={loading}
                size="large"
              >
                Browse for XML File
              </Button>
              
              {fileList.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <Text strong>Selected file: </Text>
                  <Text code>{fileName}</Text>
                  <Button 
                    type="link" 
                    size="small"
                    onClick={() => {
                      setFileList([]);
                      setEventInfo(null);
                      setResult(null);
                      setFileContent('');
                      setFileName('');
                      setFilePath('');
                      setEventSource('unknown');
                      setCurrentStep('source');
                      setValidationBatch(null);
                      setCorrectedXML('');
                    }}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </Space>

            {eventInfo && (
              <Alert
                message="Event Information Detected"
                description={
                  <div>
                    <Text strong>Event: </Text>
                    <Text>{eventInfo.name}</Text>
                    <br />
                    <Text strong>Date: </Text>
                    <Text>{eventInfo.date}</Text>
                  </div>
                }
                type="info"
                showIcon
                style={{ marginTop: '16px' }}
              />
            )}
          </Card>

          {/* Event Source Selection */}
{false && (
            <Card type="inner" title="2. Event Source" style={{ backgroundColor: '#f0f5ff' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text>
                  Was this event run in <strong>MeOS</strong> or <strong>OE12</strong>?
                </Typography.Text>
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 16 }}>
                  This determines how runner data is validated and corrected before exporting results.
                </Typography.Paragraph>

                <Radio.Group
                  onChange={(e) => handleSelectEventSource(e.target.value as EventSource)}
                  style={{ marginBottom: 16 }}
                  value={eventSource}
                >
                  <Space direction="vertical">
                    <Radio value="MeOS">
                      <Space direction="vertical" size={0}>
                        <span><strong>Clean MeOS (recommended)</strong></span>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Fix live MeOS entries using Runner DB before exporting (no XML edits)
                        </Typography.Text>
                      </Space>
                    </Radio>
                    <Radio value="OE12">
                      <Space direction="vertical" size={0}>
                        <span><strong>Clean XML only (OE12)</strong></span>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Validate this OE12 XML against Runner DB (MeOS unchanged)
                        </Typography.Text>
                      </Space>
                    </Radio>
                    <Radio value="unknown">
                      <Space direction="vertical" size={0}>
                        <span><strong>Skip validation</strong></span>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Generate HTML as-is without any corrections
                        </Typography.Text>
                      </Space>
                    </Radio>
                  </Space>
                </Radio.Group>

                {eventSource === 'MeOS' && (
                  <div>
                    <Button type="primary" onClick={() => handleSelectEventSource('MeOS')}>
                      Review & Fix in MeOS (Runner DB)
                    </Button>
                  </div>
                )}
              </Space>
            </Card>
          )}

          {/* Validation Review */}
          {currentStep === 'review' && validationBatch && (
            <Card type="inner" title="3. Validation Review" style={{ backgroundColor: '#fff7e6' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Alert
                  message="Runner Data Validation"
                  description={`Reviewing ${validationBatch.runners.length} runners for corrections`}
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />

                <div style={{ marginBottom: 16 }}>
                  <Button
                    type="link"
                    onClick={() => setShowValidationReport(true)}
                    icon={<InfoCircleOutlined />}
                  >
                    View Detailed Validation Report
                  </Button>
                </div>

                <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, marginBottom: 16 }}>
                  <Typography.Text strong>Validation Summary:</Typography.Text>
                  <br />
                  <Typography.Text>
                    {runnerValidationService.getValidationSummary(
                      validationBatch.validationResults.map(r => ({
                        valid: r.valid,
                        diffs: r.diffs,
                        suggestedCorrections: r.suggestedCorrections,
                        matchedRunner: r.matchedRunner
                      }))
                    ).invalidRunners} runners need corrections
                  </Typography.Text>
                </div>

                {eventSource === 'MeOS' && (
                  <Space>
                    <Button type="primary" onClick={() => setReviewOpen(true)}>
                      Open Review & Fix (MeOS)
                    </Button>
                    <Button onClick={() => setCurrentStep('generate')}>Skip Corrections</Button>
                  </Space>
                )}

                {eventSource !== 'MeOS' && (
                  <>
                    <Typography.Text type="secondary">Select correction level:</Typography.Text>
                    <Space wrap>
                      <Button onClick={() => handleApplyCorrections('all')} type="primary">Apply All Corrections</Button>
                      <Button onClick={() => handleApplyCorrections('warning')}>Apply Warnings Only</Button>
                      <Button onClick={() => handleApplyCorrections('info')}>Apply Info Only</Button>
                      <Button onClick={() => handleApplyCorrections('none')}>Skip Corrections</Button>
                    </Space>
                  </>
                )}
              </Space>
            </Card>
          )}

          {/* Validation Report Modal */}
          <Modal
            title="Validation Report"
            open={showValidationReport && !!validationBatch}
            onCancel={() => setShowValidationReport(false)}
            width={900}
            footer={<Button onClick={() => setShowValidationReport(false)}>Close</Button>}
          >
            <div style={{ maxHeight: 600, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 11 }}>
              {validationBatch ? meosResultsValidationService.generateValidationReport(validationBatch) : ''}
            </div>
          </Modal>

          {/* Review & Fix Modal (MeOS) */}
          {eventSource === 'MeOS' && validationBatch && (
            <ResultsReviewAndFix
              open={reviewOpen}
              onClose={() => setReviewOpen(false)}
              runners={validationBatch.runners}
            />
          )}

          {/* Review & Fix Modal (XML) */}
          {xmlReviewOpen && (
            <ResultsXmlReviewAndFix
              open={xmlReviewOpen}
              onClose={() => setXmlReviewOpen(false)}
              xmlContent={fileContent}
              eventName={eventInfo?.name || 'Event'}
              eventDate={eventInfo?.date || new Date().toISOString().split('T')[0]}
              savePath={filePath || null}
              onApplyXml={(corrected, saved) => { setCorrectedXML(corrected); if (saved) message.success(`Saved corrected XML: ${saved}`); setCurrentStep('generate'); }}
              onDbUpdated={(stats) => { message.success(`Runner DB updated (${stats.updated} updated, ${stats.created} new)`); }}
            />
          )}

          {/* XML Review Step */}
          {fileContent && (
            <Card type="inner" title="3. Review XML vs Runner Database">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Paragraph type="secondary">Analyze the imported XML against your Runner Database, apply fixes to the XML, and optionally update the database.</Typography.Paragraph>
                <Space>
                  <Button type="primary" onClick={() => setXmlReviewOpen(true)} disabled={!eventInfo}>Open Review & Fix (XML)</Button>
                </Space>
              </Space>
            </Card>
          )}

          {/* Generate Button */}
          <Card
            type="inner"
            title="4. Generate HTML Results"
            style={currentStep === 'generate' ? { backgroundColor: '#f6ffed', borderColor: '#b7eb8f' } : {}}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Paragraph type="secondary">
                Two HTML files will be generated in the same directory as the XML file:
                <ul style={{ paddingLeft: '20px', marginTop: '8px', marginBottom: 0 }}>
                  <li><strong>_results.html</strong> - Professional results with rankings and times</li>
                  <li><strong>_splits.html</strong> - Detailed splits analysis with color coding</li>
                </ul>
              </Paragraph>

              <Button
                type="primary"
                size="large"
                icon={<FileTextOutlined />}
                onClick={handleGenerateHTML}
                loading={loading}
                disabled={fileList.length === 0 || !eventInfo}
                block
              >
                Generate Results & Splits HTML
              </Button>

              {loading && (
                <Progress percent={100} status="active" showInfo={false} />
              )}
            </Space>
          </Card>

          {/* Results */}
          {result && (
            <Card
              type="inner"
              title="Generation Complete"
              style={{
                borderColor: result.success ? '#52c41a' : '#ff4d4f'
              }}
            >
              {result.success ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Alert
                    message="Success!"
                    description={
                      <div>
                        <Text strong>Results HTML:</Text>
                        <br />
                        <Text code>{result.resultsPath}</Text>
                        <br />
                        <br />
                        <Text strong>Splits HTML:</Text>
                        <br />
                        <Text code>{result.splitsPath}</Text>
                      </div>
                    }
                    type="success"
                    showIcon
                    icon={<CheckCircleOutlined />}
                  />

                  <Space>
                    <Button type="primary" onClick={handleOpenResults}>
                      Open Results
                    </Button>
                    <Button type="default" onClick={handleOpenSplits}>
                      Open Splits
                    </Button>
                    <Button
                      onClick={() => {
                        setFileList([]);
                        setEventInfo(null);
                        setResult(null);
                        setFileContent('');
                        setFileName('');
                        setFilePath('');
                        setEventSource('unknown');
                        setCurrentStep('source');
                        setValidationBatch(null);
                        setCorrectedXML('');
                      }}
                    >
                      Generate Another
                    </Button>
                  </Space>
                </Space>
              ) : (
                <Alert
                  message="Error"
                  description={result.error}
                  type="error"
                  showIcon
                />
              )}
            </Card>
          )}

          {/* Features Info */}
          <Card type="inner" title="Features" size="small">
            <Paragraph strong>Results HTML:</Paragraph>
            <ul style={{ paddingLeft: '20px', margin: '0 0 12px 0' }}>
              <li>Automatic course color sorting (White → Yellow → Orange → Brown → Green → Red → Blue)</li>
              <li>Professional styling with gold/silver/bronze highlights for top 3</li>
              <li>Time behind calculation for all finishers</li>
              <li>Proper grouping: Finishers → MP → DNF</li>
              <li>Mobile responsive design</li>
            </ul>
            <Paragraph strong>Splits HTML:</Paragraph>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              <li>AttackPoint-style color coding (green=fast, red=slow)</li>
              <li>Bold highlights for fastest splits</li>
              <li>Cumulative and leg times displayed</li>
              <li>Easy identification of time gains/losses</li>
            </ul>
          </Card>
        </Space>
      </Card>
    </div>
  );
};

export default ResultsExport;
