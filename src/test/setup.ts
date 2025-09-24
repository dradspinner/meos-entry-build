// Test setup file
import '@testing-library/jest-dom';

// Mock global objects that might not be available in test environment
global.DOMParser = window.DOMParser;

// Setup any global test configuration here