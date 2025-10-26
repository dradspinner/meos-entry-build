import React, { useState } from 'react';
import { Card, Button, Upload, Space, Alert, Typography, Progress, message } from 'antd';
import { UploadOutlined, FileTextOutlined, CheckCircleOutlined, GlobalOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { resultsExportService } from '../services/resultsExportService';

const { Title, Text, Paragraph } = Typography;

interface GenerationResult {
  success: boolean;
  resultsPath?: string;
  splitsPath?: string;
  error?: string;
}

const ResultsExport: React.FC = () => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [eventInfo, setEventInfo] = useState<{ name: string; date: string } | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('');

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
      
      message.success(`File loaded: ${file.name}`);
    } catch (error) {
      console.error('Error reading file:', error);
      message.error('Failed to read XML file');
    } finally {
      setLoading(false);
    }

    return false; // Prevent auto upload
  };

  const handleGenerateHTML = async () => {
    if (fileList.length === 0 || !fileContent) {
      message.warning('Please select an XML file first');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // Parse XML using stored content
      const classResults = resultsExportService.parseOE12XML(fileContent);

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

          {/* File Upload */}
          <Card type="inner" title="1. Select OE12 XML Results File">
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

          {/* Generate Button */}
          <Card type="inner" title="2. Generate HTML Results">
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
