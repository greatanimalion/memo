interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle }) => {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-2">{title}</h1>
      {subtitle && <p className="text-gray-500">{subtitle}</p>}
    </div>
  );
};

export default PageHeader;
