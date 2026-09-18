import { createGlobalStyle } from "styled-components";

export const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: ${({ theme }) => theme.fonts.sans};
    color: ${({ theme }) => theme.colors.ink};
    background: ${({ theme }) => theme.colors.paper};
  }
  button, input, select, textarea { font: inherit; }
  button { cursor: pointer; }
  a { color: ${({ theme }) => theme.colors.tealDeep}; }
`;

export default GlobalStyle;
