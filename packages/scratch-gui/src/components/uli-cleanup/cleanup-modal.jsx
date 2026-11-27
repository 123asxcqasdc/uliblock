import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Modal from '../../containers/modal.jsx';
import styles from './cleanup-modal.css';

const CleanupModalComponent = ({
    isRu,
    scanStats,
    options,
    busy,
    progress,
    resultSummary,
    errorMessage,
    onToggleOption,
    onRunCleanup,
    onClose
}) => (
    <Modal
        className={styles.modalContent}
        contentLabel={isRu ? 'Очистка кода во всех спрайтах' : 'Clean up code across all sprites'}
        id="uliCleanupProjectModal"
        onRequestClose={onClose}
    >
        <div className={styles.body}>
            <div className={styles.scanGrid}>
                <div className={styles.scanCard}>
                    <span className={styles.scanLabel}>
                        {isRu ? 'Спрайтов и сцена' : 'Sprites & Stage'}
                    </span>
                    <span className={styles.scanValue}>{scanStats.targetCount}</span>
                </div>
                <div className={styles.scanCard}>
                    <span className={styles.scanLabel}>
                        {isRu ? 'Скриптов без шапки' : 'Hatless scripts'}
                    </span>
                    <span className={styles.scanValue}>{scanStats.hatlessScripts}</span>
                </div>
                <div className={styles.scanCard}>
                    <span className={styles.scanLabel}>
                        {isRu ? 'Пустых шапок без кода' : 'Empty hat blocks'}
                    </span>
                    <span className={styles.scanValue}>{scanStats.emptyHats}</span>
                </div>
                <div className={styles.scanCard}>
                    <span className={styles.scanLabel}>
                        {isRu ? 'Лишних локальных перем./списков' : 'Unused local vars / lists'}
                    </span>
                    <span className={styles.scanValue}>
                        {scanStats.unusedLocalVars + scanStats.unusedLocalLists}
                    </span>
                </div>
            </div>

            <div className={styles.optionsList}>
                <label className={styles.optionItem}>
                    <input
                        type="checkbox"
                        className={styles.optionCheckbox}
                        checked={options.removeHatless}
                        disabled={busy}
                        onChange={() => onToggleOption('removeHatless')}
                    />
                    <div className={styles.optionText}>
                        <span className={styles.optionTitle}>
                            {isRu ? 'Удалить скрипты без шапки' : 'Delete hatless scripts'}
                        </span>
                        <span className={styles.optionDesc}>
                            {isRu ?
                                'Удаляет цепочки и отдельные блоки без события сверху (включая лишние сенсоры), которые не могут запуститься.' :
                                'Removes stacks and floating reporter blocks with no hat block above them.'}
                        </span>
                    </div>
                </label>

                <label className={styles.optionItem}>
                    <input
                        type="checkbox"
                        className={styles.optionCheckbox}
                        checked={options.removeEmptyHats}
                        disabled={busy}
                        onChange={() => onToggleOption('removeEmptyHats')}
                    />
                    <div className={styles.optionText}>
                        <span className={styles.optionTitle}>
                            {isRu ? 'Удалить шапки без скрипта' : 'Delete empty hat blocks'}
                        </span>
                        <span className={styles.optionDesc}>
                            {isRu ?
                                'Удаляет события без прикреплённого кода, которые получают сигнал, но ничего не выполняют.' :
                                'Removes event/clone hat blocks that have no blocks attached below them.'}
                        </span>
                    </div>
                </label>

                <label className={styles.optionItem}>
                    <input
                        type="checkbox"
                        className={styles.optionCheckbox}
                        checked={options.removeUnusedLocals}
                        disabled={busy}
                        onChange={() => onToggleOption('removeUnusedLocals')}
                    />
                    <div className={styles.optionText}>
                        <span className={styles.optionTitle}>
                            {isRu ?
                                'Удалить неиспользуемые локальные переменные и списки (без вопросов)' :
                                'Delete unused local variables and lists (silently)'}
                        </span>
                        <span className={styles.optionDesc}>
                            {isRu ?
                                'Автоматически удаляет пустые локальные переменные и списки в каждом спрайте без всплывающих подтверждений.' :
                                'Automatically removes unreferenced local variables and lists without confirmation dialogs.'}
                        </span>
                    </div>
                </label>

                <label className={styles.optionItem}>
                    <input
                        type="checkbox"
                        className={styles.optionCheckbox}
                        checked={options.runCleanUpPlus}
                        disabled={busy}
                        onChange={() => onToggleOption('runCleanUpPlus')}
                    />
                    <div className={styles.optionText}>
                        <span className={styles.optionTitle}>
                            {isRu ?
                                'Выполнить «Очистить блоки +» во всех спрайтах (по 5 в колонке, длинные — направо)' :
                                'Run "Clean up Blocks +" across all sprites (5 per column, long scripts right)'}
                        </span>
                        <span className={styles.optionDesc}>
                            {isRu ?
                                'Сортирует скрипты по длине и раскладывает по 5 в колонку, перенося достаточно длинные скрипты в последнюю колонку справа.' :
                                'Sorts scripts by length into columns of 5, placing sufficiently long scripts in the last column on the right.'}
                        </span>
                    </div>
                </label>
            </div>

            {busy && progress && (
                <div className={styles.progressBox}>
                    {isRu ?
                        `Очистка: ${progress.current} / ${progress.total} (${progress.targetName})...` :
                        `Cleaning: ${progress.current} / ${progress.total} (${progress.targetName})...`}
                </div>
            )}

            {resultSummary && (
                <div className={styles.resultBox}>
                    <div className={styles.resultTitle}>
                        {isRu ? 'Очистка завершена!' : 'Cleanup complete!'}
                    </div>
                    <div>
                        {isRu ?
                            `Проверено целей: ${resultSummary.targetsProcessed} • Скриптов без шапки удалено: ${resultSummary.hatlessRemoved + resultSummary.orphansRemoved} • Пустых шапок удалено: ${resultSummary.emptyHatsRemoved} • Локальных переменных/списков удалено: ${resultSummary.varsRemoved + resultSummary.listsRemoved}` :
                            `Targets checked: ${resultSummary.targetsProcessed} • Hatless scripts removed: ${resultSummary.hatlessRemoved + resultSummary.orphansRemoved} • Empty hats removed: ${resultSummary.emptyHatsRemoved} • Unused local vars/lists removed: ${resultSummary.varsRemoved + resultSummary.listsRemoved}`}
                    </div>
                </div>
            )}

            {errorMessage && (
                <div className={styles.errorBox}>{errorMessage}</div>
            )}

            <div className={styles.footer}>
                <button
                    type="button"
                    className={styles.btn}
                    disabled={busy}
                    onClick={onClose}
                >
                    {resultSummary ? (isRu ? 'Готово' : 'Done') : (isRu ? 'Закрыть' : 'Close')}
                </button>
                <button
                    type="button"
                    className={classNames(styles.btn, styles.btnPrimary)}
                    disabled={busy}
                    onClick={onRunCleanup}
                >
                    {busy ?
                        (isRu ? 'Очистка...' : 'Cleaning...') :
                        (isRu ? 'Очистить всё' : 'Clean up all')}
                </button>
            </div>
        </div>
    </Modal>
);

CleanupModalComponent.propTypes = {
    isRu: PropTypes.bool,
    scanStats: PropTypes.shape({
        targetCount: PropTypes.number,
        totalScripts: PropTypes.number,
        hatlessScripts: PropTypes.number,
        emptyHats: PropTypes.number,
        unusedLocalVars: PropTypes.number,
        unusedLocalLists: PropTypes.number
    }).isRequired,
    options: PropTypes.shape({
        removeHatless: PropTypes.bool,
        removeEmptyHats: PropTypes.bool,
        removeUnusedLocals: PropTypes.bool,
        runCleanUpPlus: PropTypes.bool
    }).isRequired,
    busy: PropTypes.bool,
    progress: PropTypes.shape({
        current: PropTypes.number,
        total: PropTypes.number,
        targetName: PropTypes.string
    }),
    resultSummary: PropTypes.shape({
        targetsProcessed: PropTypes.number,
        targetsModified: PropTypes.number,
        hatlessRemoved: PropTypes.number,
        emptyHatsRemoved: PropTypes.number,
        orphansRemoved: PropTypes.number,
        varsRemoved: PropTypes.number,
        listsRemoved: PropTypes.number
    }),
    errorMessage: PropTypes.string,
    onToggleOption: PropTypes.func.isRequired,
    onRunCleanup: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
};

export default CleanupModalComponent;
