function LoadingOverlay({ loadingText }) {
    return (
        <div className="loading-overlay">
            <div className="loading-logo-reveal">
                <h1>
                    {'OPIC'.split('').map((char, index) => (
                        <span key={index} style={{ animationDelay: `${index * 0.2}s` }}>
                            {char}
                        </span>
                    ))}
                </h1>
                <p>{loadingText}</p>
            </div>
        </div>
    );
}

export default LoadingOverlay;
