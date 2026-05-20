// Mock for next/dynamic
const dynamic = () => {
  return (component: () => Promise<{ default: React.ComponentType }>) => {
    const Component = async () => {
      const mod = await component();
      return mod.default;
    };
    return Component;
  };
};

export default dynamic;