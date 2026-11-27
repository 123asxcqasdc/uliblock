import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Modal from '../../containers/modal.jsx';
import styles from './send-script-modal.css';

const SendScriptModalComponent = ({
    isRu,
    targets,
    selectedIds,
    searchQuery,
    canChoosePartial,
    sendFullScript,
    fullBlockCount,
    partialBlockCount,
    busy,
    statusMessage,
    errorMessage,
    onSearchChange,
    onToggleTarget,
    onSelectAll,
    onDeselectAll,
    onChangeScope,
    onSend,
    onClose
}) => {
    const query = searchQuery.trim().toLowerCase();
    const filteredTargets = query ?
        targets.filter(t => (
            t.displayName.toLowerCase().includes(query) ||
            t.rawName.toLowerCase().includes(query) ||
            (t.folder && t.folder.toLowerCase().includes(query))
        )) :
        targets;

    const selectedCount = selectedIds.length;
    const activeBlockCount = sendFullScript ? fullBlockCount : partialBlockCount;

    return (
        <Modal
            className={styles.modalContent}
            contentLabel={isRu ? 'Отправить скрипт спрайтам' : 'Send script to sprites'}
            id="uliSendScriptModal"
            onRequestClose={onClose}
        >
            <div className={styles.body}>
                <div className={styles.summaryBar}>
                    <div>
                        <strong>
                            {isRu ? 'Скрипт для отправки:' : 'Script to send:'}
                        </strong>{' '}
                        {activeBlockCount}{' '}
                        {isRu ? 'бл.' : (activeBlockCount === 1 ? 'block' : 'blocks')}
                    </div>

                    {canChoosePartial && (
                        <div className={styles.scopeToggle}>
                            <label className={styles.scopeOption}>
                                <input
                                    type="radio"
                                    name="uliSendScope"
                                    checked={sendFullScript}
                                    onChange={() => onChangeScope(true)}
                                />
                                <span>
                                    {isRu ?
                                        `Весь скрипт (${fullBlockCount})` :
                                        `Whole script (${fullBlockCount})`}
                                </span>
                            </label>
                            <label className={styles.scopeOption}>
                                <input
                                    type="radio"
                                    name="uliSendScope"
                                    checked={!sendFullScript}
                                    onChange={() => onChangeScope(false)}
                                />
                                <span>
                                    {isRu ?
                                        `От выбранного блока (${partialBlockCount})` :
                                        `From clicked block (${partialBlockCount})`}
                                </span>
                            </label>
                        </div>
                    )}
                </div>

                <div className={styles.controlsRow}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                        placeholder={isRu ? 'Поиск спрайта...' : 'Search sprite...'}
                    />
                    <button
                        type="button"
                        className={styles.btn}
                        disabled={filteredTargets.length === 0 || busy}
                        onClick={() => onSelectAll(filteredTargets.map(t => t.id))}
                    >
                        {isRu ? 'Выбрать все' : 'Select all'}
                    </button>
                    <button
                        type="button"
                        className={styles.btn}
                        disabled={selectedCount === 0 || busy}
                        onClick={onDeselectAll}
                    >
                        {isRu ? 'Снять выбор' : 'Clear'}
                    </button>
                </div>

                <div className={styles.targetList}>
                    {filteredTargets.length === 0 ? (
                        <div className={styles.emptyState}>
                            {targets.length === 0 ?
                                (isRu ?
                                    'В проекте нет других спрайтов или сцены для отправки.' :
                                    'There are no other sprites or stage in this project.') :
                                (isRu ?
                                    'Подходящие спрайты не найдены.' :
                                    'No matching sprites found.')}
                        </div>
                    ) : (
                        filteredTargets.map(target => {
                            const isSelected = selectedIds.indexOf(target.id) !== -1;
                            return (
                                <label
                                    key={target.id}
                                    className={classNames(styles.targetItem, {
                                        [styles.targetItemSelected]: isSelected
                                    })}
                                >
                                    <input
                                        type="checkbox"
                                        className={styles.targetCheckbox}
                                        checked={isSelected}
                                        disabled={busy}
                                        onChange={() => onToggleTarget(target.id)}
                                    />
                                    {target.costumeUrl ? (
                                        <img
                                            className={styles.targetThumb}
                                            src={target.costumeUrl}
                                            alt={target.displayName}
                                            draggable={false}
                                        />
                                    ) : (
                                        <div className={styles.targetThumbPlaceholder}>
                                            {target.isStage ? '🎭' : '🐌'}
                                        </div>
                                    )}
                                    <div className={styles.targetMeta}>
                                        <div className={styles.targetNameRow}>
                                            <span className={styles.targetName}>
                                                {target.isStage ?
                                                    (isRu ? `Сцена (${target.displayName})` : `Stage (${target.displayName})`) :
                                                    target.displayName}
                                            </span>
                                            {target.folder && (
                                                <span className={styles.targetFolderBadge}>
                                                    📁 {target.folder}
                                                </span>
                                            )}
                                        </div>
                                        <span className={styles.targetSub}>
                                            {isRu ?
                                                `Скриптов: ${target.scriptCount}` :
                                                `Scripts: ${target.scriptCount}`}
                                        </span>
                                    </div>
                                </label>
                            );
                        })
                    )}
                </div>

                {statusMessage && (
                    <div className={styles.statusBanner}>{statusMessage}</div>
                )}
                {errorMessage && (
                    <div className={styles.errorBanner}>{errorMessage}</div>
                )}

                <div className={styles.footer}>
                    <div className={styles.footerCount}>
                        {isRu ?
                            `Выбрано целей: ${selectedCount}` :
                            `Selected targets: ${selectedCount}`}
                    </div>
                    <div className={styles.footerActions}>
                        <button
                            type="button"
                            className={styles.btn}
                            disabled={busy}
                            onClick={onClose}
                        >
                            {isRu ? 'Отмена' : 'Cancel'}
                        </button>
                        <button
                            type="button"
                            className={classNames(styles.btn, styles.btnPrimary)}
                            disabled={selectedCount === 0 || busy}
                            onClick={onSend}
                        >
                            {busy ?
                                (isRu ? 'Отправка...' : 'Sending...') :
                                (isRu ?
                                    `Отправить (${selectedCount})` :
                                    `Send (${selectedCount})`)}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

SendScriptModalComponent.propTypes = {
    isRu: PropTypes.bool,
    targets: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        rawName: PropTypes.string.isRequired,
        displayName: PropTypes.string.isRequired,
        folder: PropTypes.string,
        isStage: PropTypes.bool,
        costumeUrl: PropTypes.string,
        scriptCount: PropTypes.number
    })).isRequired,
    selectedIds: PropTypes.arrayOf(PropTypes.string).isRequired,
    searchQuery: PropTypes.string.isRequired,
    canChoosePartial: PropTypes.bool,
    sendFullScript: PropTypes.bool.isRequired,
    fullBlockCount: PropTypes.number.isRequired,
    partialBlockCount: PropTypes.number.isRequired,
    busy: PropTypes.bool,
    statusMessage: PropTypes.string,
    errorMessage: PropTypes.string,
    onSearchChange: PropTypes.func.isRequired,
    onToggleTarget: PropTypes.func.isRequired,
    onSelectAll: PropTypes.func.isRequired,
    onDeselectAll: PropTypes.func.isRequired,
    onChangeScope: PropTypes.func.isRequired,
    onSend: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
};

export default SendScriptModalComponent;
