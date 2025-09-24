import { useState, useEffect } from 'react';

function ScrollButtons({ ui, savedHistory }) {
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [showScrollBottom, setShowScrollBottom] = useState(false);

    const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    const scrollToBottom = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

    useEffect(() => {
        const handleScroll = () => {
            const isScrolled = window.scrollY > 200;
            setShowScrollTop(isScrolled);

            if (ui === 'review' && savedHistory.length > 1) { // 'list' 모드일 때만
                const isAtBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;
                setShowScrollBottom(!isAtBottom && document.body.scrollHeight > window.innerHeight + 50);
            } else {
                setShowScrollBottom(false);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        // 컴포넌트가 다시 렌더링될 때마다 스크롤 위치를 다시 계산
        handleScroll();

        return () => window.removeEventListener('scroll', handleScroll);
    }, [ui, savedHistory]);


    return (
        <>
            {showScrollTop && (
                <button onClick={scrollToTop} className="scroll-btn scroll-to-top-btn" title="맨 위로">
                    <i className="fas fa-arrow-up"></i>
                </button>
            )}
            {showScrollBottom && (
                <button onClick={scrollToBottom} className="scroll-btn scroll-to-bottom-btn" title="맨 아래로">
                    <i className="fas fa-arrow-down"></i>
                </button>
            )}
        </>
    );
}

export default ScrollButtons;
