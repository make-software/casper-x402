import styled from "styled-components";

export const Card = styled.div({
  background: '#ddd',
  border: '1px solid #30363d',
  borderRadius: '10px',
  padding: '20px 24px',
  marginBottom: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
});

export const CardTitle = styled.div({
  fontSize: '13px',
  fontWeight: 700,
  color: '#000',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '4px'
});

export const CardColumn = styled.div({
  display: 'flex',
  flexDirection: 'row',
  gap: '6px'
});

export const FieldLabel = styled.span({
  fontSize: '11px',
  color: '#222',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
});

export const FieldValue = styled.span({
  fontSize: '13px',
  color: '#000',
  fontFamily: 'monospace',
  wordBreak: 'break-all'
});

export const Divider = styled.hr({
  border: 'none',
  borderTop: '1px solid #21262d',
  margin: '4px 0'
});

export const ResultTextarea = styled.textarea({
  marginTop: '20px',
  width: '100%',
  minHeight: '180px',
  padding: '12px',
  background: '#eee',
  color: '#000',
  border: '1px solid #30363d',
  borderRadius: '8px',
  fontSize: '12px',
  fontFamily: 'monospace',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box'
});
