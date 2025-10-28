import DesktopBottomNav from './DesktopBottomNav';
import DesktopHeader from './DesktopHeader';
import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
import ScrollToTopButton from './ScrollToTopButton';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
}

const PageLayout = ({ children, activePath = '/' }: PageLayoutProps) => {
  return (
    <div className='w-full min-h-screen'>
      {/* 移动端头部 */}
      <MobileHeader showBackButton={['/play'].includes(activePath)} />

      {/* 桌面端头部 */}
      <DesktopHeader showBackButton={['/play'].includes(activePath)} />

      {/* 主要布局容器 */}
      <div className='flex flex-col w-full min-h-screen md:min-h-auto'>
        {/* 主内容区域 */}
        <div className='relative min-w-0 flex-1 transition-all duration-300'>
          {/* 桌面端控件已迁移到 DesktopHeader */}

          {/* 主内容 */}
          <main
            className='flex-1 md:min-h-0 mb-14 md:mb-0 overflow-y-auto'
            data-scroll-container
            style={{
              height: 'calc(100vh - 3.5rem)', // 顶栏高度为 3.5rem
              paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))', // 为底部导航留出空间
            }}
          >
            {children}
          </main>
          {/* 桌面端：回到顶部按钮 */}
          <ScrollToTopButton />
        </div>
      </div>

      {/* 移动端底部导航 */}
      <div className='md:hidden'>
        <MobileBottomNav activePath={activePath} />
      </div>

      {/* 桌面端底部居中导航 */}
      <div className='hidden md:block'>
        <DesktopBottomNav activePath={activePath} />
      </div>
    </div>
  );
};

export default PageLayout;
