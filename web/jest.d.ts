// Type definitions for Jest matchers
import '@testing-library/jest-dom';

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveValue(value: string | number | RegExp): R;
      toBeDisabled(): R;
      toBeEnabled(): R;
      toBeChecked(): R;
      toHaveClass(className: string): R;
      toHaveAttribute(attr: string, value?: string): R;
      toHaveTextContent(text: string | RegExp): R;
      toBeVisible(): R;
      toBeEmpty(): R;
      toBeEmptyDOMElement(): R;
      toBeInvalid(): R;
      toBeRequired(): R;
      toBeValid(): R;
      toContainElement(element: HTMLElement | null): R;
      toContainHTML(html: string): R;
      toHaveDisplayValue(value: string | RegExp | Array<string | RegExp>): R;
      toHaveFocus(): R;
      toHaveFormValues(values: Record<string, unknown>): R;
      toHaveStyle(css: Record<string, unknown>): R;
    }

    interface Expect {
      // These are the matchers from @testing-library/jest-dom
      toBeInTheDocument(): any;
      toHaveValue(value: string | number | RegExp): any;
      toBeDisabled(): any;
      toBeEnabled(): any;
      toBeChecked(): any;
      toHaveClass(className: string): any;
      toHaveAttribute(attr: string, value?: string): any;
      toHaveTextContent(text: string | RegExp): any;
      toBeVisible(): any;
      toBeEmpty(): any;
      toBeEmptyDOMElement(): any;
      toBeInvalid(): any;
      toBeRequired(): any;
      toBeValid(): any;
      toContainElement(element: HTMLElement | null): any;
      toContainHTML(html: string): any;
      toHaveDisplayValue(value: string | RegExp | Array<string | RegExp>): any;
      toHaveFocus(): any;
      toHaveFormValues(values: Record<string, unknown>): any;
      toHaveStyle(css: Record<string, unknown>): any;
    }
  }
}