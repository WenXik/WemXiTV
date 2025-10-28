'use client';

import Link from 'next/link';

import { BackButton } from './BackButton';
import { useSite } from './SiteProvider';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

interface DesktopHeaderProps {
  showBackButton?: boolean;
}

const DesktopHeader = ({ showBackButton = false }: DesktopHeaderProps) => {
  const { siteName } = useSite();

  return (
    <header
      data-liquid
      className='hidden md:block sticky top-0 z-[1000] w-full border-b'
    >
      <div className='h-14 flex items-center justify-between px-6 relative z-10'>
        {/* 左侧：返回按钮（移除折叠按钮） */}
        <div className='flex items-center gap-2'>
          {showBackButton && <BackButton />}
        </div>

        {/* 中间：Logo 或站点名 */}
        <div className='pointer-events-auto flex-1 text-center'>
          <Link
            href='/'
            className='text-xl font-bold text-green-600 tracking-tight hover:opacity-80 transition-opacity'
          >
            {siteName}
          </Link>
        </div>

        {/* 右侧按钮 */}
        <div className='flex items-center gap-2'>
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
};

export default DesktopHeader;