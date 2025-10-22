import { useState } from 'react';
import { Card, Alert, Button, Space, message, Modal, Typography } from 'antd';
import { ImportOutlined, ExportOutlined } from '@ant-design/icons';
import { localRunnerService } from '../../../services/localRunnerService';

export default function DataImportExport() {
  const [xmlImporting, setXmlImporting] = useState<boolean>(false);
  const [pendingXmlFile, setPendingXmlFile] = useState<File | null>(null);

  const handleXMLImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    event.target.value = '';
    setPendingXmlFile(file);
  };

  const executeXMLImport = async (mode: 'merge' | 'replace') => {
    if (!pendingXmlFile) return;
    
    const file = pendingXmlFile;
    setPendingXmlFile(null);
    setXmlImporting(true);
    
    try {
      message.loading(`${mode === 'merge' ? 'Merging' : 'Replacing with'} XML file...`, 0);
      
      const xmlContent = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
      
      const competitors = xmlDoc.getElementsByTagName('Competitor');
      const xmlRunners = [];
      
      for (let i = 0; i < competitors.length; i++) {
        const competitor = competitors[i];
        const person = competitor.getElementsByTagName('Person')[0];
        if (!person) continue;
        
        const nameElement = person.getElementsByTagName('Name')[0];
        if (!nameElement) continue;
        
        const givenName = nameElement.getElementsByTagName('Given')[0]?.textContent?.trim();
        const familyName = nameElement.getElementsByTagName('Family')[0]?.textContent?.trim();
        
        if (!givenName || !familyName) continue;
        
        const sex = person.getAttribute('sex') || undefined;
        const birthDateElement = person.getElementsByTagName('BirthDate')[0];
        let birthYear;
        if (birthDateElement) {
          const birthDate = birthDateElement.textContent?.trim();
          if (birthDate) birthYear = parseInt(birthDate.split('-')[0]);
        }
        
        const controlCard = competitor.getElementsByTagName('ControlCard')[0];
        let cardNumber;
        if (controlCard) {
          const cardText = controlCard.textContent?.trim();
          if (cardText) cardNumber = parseInt(cardText);
        }
        
        const orgElement = competitor.getElementsByTagName('Organisation')[0];
        let club = '';
        if (orgElement) {
          const orgName = orgElement.getElementsByTagName('Name')[0]?.textContent?.trim();
          if (orgName) {
            club = orgName;
          } else {
            const orgId = orgElement.getElementsByTagName('Id')[0]?.textContent?.trim();
            if (orgId === '852') club = 'DVOA';
            else if (orgId === '3') club = 'QOC';
            else if (orgId === '4') club = 'HVO';
            else if (orgId === '14') club = 'None';
            else if (orgId === '90010') club = 'CSU';
            else club = orgId ? `Org-${orgId}` : '';
          }
        }
        
        xmlRunners.push({
          name: { first: givenName, last: familyName },
          club: club,
          birthYear: birthYear,
          sex: sex as 'M' | 'F' | undefined,
          cardNumber: cardNumber,
          nationality: '',
          phone: '',
          email: ''
        });
      }
      
      message.destroy();
      
      if (xmlRunners.length === 0) {
        message.error('No valid runners found in XML file');
        return;
      }
      
      if (mode === 'replace') {
        localRunnerService.clearAllRunners();
      }
      
      let imported = 0;
      const initialCount = localRunnerService.getAllRunners().length;
      
      xmlRunners.forEach(runnerData => {
        localRunnerService.addRunner(runnerData);
        imported++;
      });
      
      const finalCount = localRunnerService.getAllRunners().length;
      const newRunners = mode === 'merge' ? finalCount - initialCount : imported;
      const updatedRunners = mode === 'merge' ? imported - newRunners : 0;
      
      if (mode === 'merge') {
        message.success(`Merged ${imported} runners: ${newRunners} new, ${updatedRunners} updated`);
      } else {
        message.success(`Replaced database with ${imported} runners from ${file.name}`);
      }
      
      // Trigger custom event for other components to refresh
      window.dispatchEvent(new Event('localRunnerDatabaseUpdate'));
      
    } catch (error) {
      message.destroy();
      console.error('XML import error:', error);
      message.error(`Failed to import XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setXmlImporting(false);
    }
  };

  return (
    <div>
      <Alert
        message="Data Import/Export"
        description="Import runner data from external sources or export for backup."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title="Import/Export Operations">
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Card size="small" title="Import from XML">
            <p>Import runner data from IOF XML 3.0 format (MeOS exports, event results, etc.)</p>
            <Space>
              <input 
                type="file" 
                id="xmlFileInput" 
                accept=".xml" 
                style={{display: 'none'}} 
                onChange={handleXMLImport} 
              />
              <Button 
                type="primary" 
                icon={<ImportOutlined />}
                loading={xmlImporting}
                onClick={() => document.getElementById('xmlFileInput')?.click()}
              >
                Import XML
              </Button>
              <Typography.Text type="secondary">
                Supports IOF XML 3.0 format with Competitor or PersonResult elements
              </Typography.Text>
            </Space>
          </Card>

          <Card size="small" title="Export Data">
            <p>Export runner database for backup or external use.</p>
            <Button icon={<ExportOutlined />} disabled>
              Export Database (Coming Soon)
            </Button>
          </Card>
        </Space>
      </Card>

      {/* Import Mode Selection Modal */}
      <Modal
        title="Import XML - Choose Mode"
        open={pendingXmlFile !== null}
        onCancel={() => setPendingXmlFile(null)}
        footer={[
          <Button key="cancel" onClick={() => setPendingXmlFile(null)}>
            Cancel
          </Button>,
          <Button 
            key="merge" 
            type="default" 
            onClick={() => executeXMLImport('merge')}
            style={{ backgroundColor: '#52c41a', color: 'white' }}
          >
            Merge/Sync
          </Button>,
          <Button 
            key="replace" 
            type="primary" 
            danger
            onClick={() => executeXMLImport('replace')}
          >
            Replace All
          </Button>
        ]}
        width={500}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Typography.Paragraph>
            <strong>File:</strong> {pendingXmlFile?.name}
          </Typography.Paragraph>
          
          <Typography.Paragraph>
            How do you want to import this XML file?
          </Typography.Paragraph>

          <Card size="small" style={{ backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              <ImportOutlined /> Merge/Sync (Recommended)
            </Typography.Title>
            <ul style={{ marginBottom: 0 }}>
              <li>Adds new runners from XML</li>
              <li>Updates existing runners with XML data</li>
              <li>Keeps existing runners not in XML</li>
              <li><strong>Safe:</strong> No data loss</li>
            </ul>
          </Card>

          <Card size="small" style={{ backgroundColor: '#fff1f0', borderColor: '#ffccc7' }}>
            <Typography.Title level={5} style={{ marginTop: 0, color: '#cf1322' }}>
              ⚠️ Replace All
            </Typography.Title>
            <ul style={{ marginBottom: 0 }}>
              <li>Deletes ALL existing runners</li>
              <li>Replaces with only runners from XML</li>
              <li><strong>Warning:</strong> Cannot be undone</li>
            </ul>
          </Card>
        </Space>
      </Modal>
    </div>
  );
}
