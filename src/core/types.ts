import type MarkdownIt from 'markdown-it';
import type { Component } from 'vue';

export type MarkdownHeadingTag =
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6';

export interface MarkdownTextBlock {
  id: string;
  kind: 'text';
  tag: MarkdownHeadingTag;
  text: string;
}

export interface MarkdownHtmlBlock {
  id: string;
  kind: 'html';
  html: string;
}

export interface MarkdownCodeBlock {
  id: string;
  kind: 'code';
  code: string;
  language: string;
  meta: string;
}

export interface MarkdownThoughtBlock {
  id: string;
  kind: 'thought';
  title: string;
  blocks: MarkdownBlock[];
}

export interface MarkdownMathBlock {
  id: string;
  kind: 'math';
  expression: string;
  displayMode: boolean;
}

export interface MarkdownAguiBlock {
  id: string;
  kind: 'agui';
  name: string;
  props: Record<string, unknown>;
  minHeight: number;
}

export type MarkdownBlock =
  | MarkdownTextBlock
  | MarkdownHtmlBlock
  | MarkdownCodeBlock
  | MarkdownThoughtBlock
  | MarkdownMathBlock
  | MarkdownAguiBlock;

export interface AguiComponentRegistration {
  component: Component;
  minHeight?: number;
}

export type AguiComponentMap = Record<string, Component | AguiComponentRegistration>;

export type MarkdownEnginePlugin = (md: MarkdownIt) => void;

export interface ParseMarkdownOptions {
  plugins?: MarkdownEnginePlugin[];
  thoughtTitle?: string;
  aguiComponents?: AguiComponentMap;
}
