import React from 'react';
import { Snackbar, Alert, AlertProps } from '@mui/material';

export interface SnackbarNotificationProps {
  open: boolean;
  message: string;
  severity?: AlertProps['severity'];
  autoHideDuration?: number;
  onClose: () => void;
}

const SnackbarNotification: React.FC<SnackbarNotificationProps> = ({
  open,
  message,
  severity = 'info',
  autoHideDuration = 6000,
  onClose,
}) => {
  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert onClose={onClose} severity={severity} sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  );
};

export default SnackbarNotification;
