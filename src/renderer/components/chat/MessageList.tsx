import React, { useEffect, useRef } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import MessageItem from './MessageItem';
import { ChatMessage } from '../../../main/types';

interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  status: 'error' | 'ready' | 'submitted' | 'streaming';
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading,
  status,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  console.log('MessageList: ', messages);

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflow: 'auto',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        '& > *': {
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%',
        },
      }}
      className="hidden-scrollbar"
    >
      {messages.map((m) => {
        // 'tool-call' パートだけを抽出
        const toolParts =
          m.parts?.filter((p) => p.type === 'tool-invocation') ?? [];

        return (
          <Box key={m.id} mb={2}>
            {toolParts.map((part) => {
              const ti = part.toolInvocation;

              if (ti.toolName === 'sourceListTool') {
                return null;
              }

              if (ti.toolName === 'updateWorkingMemory') {
                return (
                  <Box key={ti.toolCallId} mb={1}>
                    <Typography variant="caption" color="text.secondary">
                      メモリ更新
                    </Typography>
                  </Box>
                );
              }

              const renderToolHeader = () => {
                if (ti.toolName === 'querySourceTool') {
                  const jargs = JSON.parse(JSON.stringify(ti.args));
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <SearchIcon sx={{ mr: 1 }} />
                      {`ソース検索：${jargs.path || ''}`}
                    </Box>
                  );
                }
                return ti.toolName;
              };

              const renderToolContent = () => {
                const jti = JSON.parse(JSON.stringify(ti));
                if (ti.toolName === 'querySourceTool') {
                  return `検索内容：${JSON.stringify(jti.args?.query)}\n検索結果：${jti.result?.answer || ''}`;
                }
                return `Args：${jti.args}\nResult：${jti.result}}`;
              };

              return (
                <Accordion key={ti.toolCallId}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    {renderToolHeader()}
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box
                      mb={1}
                      p={1}
                      sx={{
                        bgcolor: 'grey.100',
                        borderRadius: 1,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {renderToolContent()}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              );
            })}
            {m.content && <MessageItem message={m} />}
          </Box>
        );
      })}

      {status === 'streaming' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            mt: 1,
          }}
        >
          <CircularProgress size={20} />
          <Box component="span" sx={{ ml: 1, fontSize: '0.875rem' }}>
            応答中…
          </Box>
        </Box>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      <Box ref={bottomRef} />
    </Box>
  );
};

export default MessageList;
