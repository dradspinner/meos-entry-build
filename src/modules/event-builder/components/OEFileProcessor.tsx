import { Card, Alert, Button } from 'antd';

interface OEFileProcessorProps {
  data: any;
  onComplete: (data: any) => void;
  isProcessing: boolean;
}

export default function OEFileProcessor({ data, onComplete, isProcessing }: OEFileProcessorProps) {
  const handleContinue = () => {
    onComplete({ entries: [] });
  };

  return (
    <div>
      <Alert
        message="OE File Processing"
        description="Import and validate OE registration files, resolve conflicts with runner database."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title="Coming Soon">
        <p>OE file processing functionality will be implemented here.</p>
        
        <div style={{ textAlign: 'right', marginTop: 24 }}>
          <Button 
            type="primary" 
            onClick={handleContinue}
            loading={isProcessing}
          >
            Continue to MeOS XML Generation
          </Button>
        </div>
      </Card>
    </div>
  );
}