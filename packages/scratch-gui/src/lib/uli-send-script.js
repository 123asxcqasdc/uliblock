import getCostumeUrl from './get-costume-url';
import {placeInViewport, findTopBlock} from './backpack/code-payload';

let pendingSendScript = null;

const setPendingSendScript = info => {
    pendingSendScript = info ? Object.assign({}, info) : null;
};

const getPendingSendScript = () => pendingSendScript;

const clearPendingSendScript = () => {
    pendingSendScript = null;
};

const getBlockFromContainer = (blocksContainer, blockId) => {
    if (!blocksContainer || !blockId) return null;
    if (typeof blocksContainer.getBlock === 'function') {
        return blocksContainer.getBlock(blockId) || null;
    }
    if (blocksContainer._blocks) {
        return blocksContainer._blocks[blockId] || null;
    }
    return null;
};

const collectStandaloneBlocksForRoot = (blocksContainer, startBlockId) => {
    const startBlock = getBlockFromContainer(blocksContainer, startBlockId);
    if (!startBlock) return null;

    const visited = new Set();
    const collected = [];

    const visit = (blockId, isRoot) => {
        if (!blockId || visited.has(blockId)) return;
        const rawBlock = getBlockFromContainer(blocksContainer, blockId);
        if (!rawBlock) return;
        visited.add(blockId);

        const clone = JSON.parse(JSON.stringify(rawBlock));
        delete clone.comment;
        if (isRoot) {
            clone.topLevel = true;
            clone.parent = null;
        } else {
            clone.topLevel = false;
        }
        collected.push(clone);

        if (rawBlock.next) {
            visit(rawBlock.next, false);
        }

        const inputs = rawBlock.inputs || {};
        for (const key of Object.keys(inputs)) {
            const input = inputs[key];
            if (!input) continue;
            if (input.block) {
                visit(input.block, false);
            }
            if (input.shadow && input.shadow !== input.block) {
                visit(input.shadow, false);
            }
        }
    };

    visit(startBlockId, true);
    return collected;
};

const countBlocksInStack = (blocksContainer, startBlockId) => {
    const blocks = collectStandaloneBlocksForRoot(blocksContainer, startBlockId);
    return blocks ? blocks.length : 0;
};

const parseSpriteFolderName = rawName => {
    const name = String(rawName || '');
    const sepIdx = name.lastIndexOf('//');
    if (sepIdx > 0 && sepIdx < name.length - 2) {
        return {
            folder: name.slice(0, sepIdx),
            displayName: name.slice(sepIdx + 2)
        };
    }
    return {
        folder: '',
        displayName: name
    };
};

const getTargetListForSend = (vm, currentTargetId) => {
    if (!vm || !vm.runtime || !Array.isArray(vm.runtime.targets)) return [];

    const targets = vm.runtime.targets.filter(t => t && t.isOriginal && t.id !== currentTargetId);
    const items = targets.map(target => {
        const rawName = typeof target.getName === 'function' ?
            target.getName() :
            (target.sprite ? target.sprite.name : target.id);
        const {folder, displayName} = target.isStage ?
            {folder: '', displayName: rawName} :
            parseSpriteFolderName(rawName);

        const costumes = typeof target.getCostumes === 'function' ? target.getCostumes() : [];
        const currentCostume = costumes[target.currentCostume] || costumes[0] || null;
        let costumeUrl = null;
        if (currentCostume && currentCostume.asset) {
            try {
                costumeUrl = getCostumeUrl(currentCostume.asset);
            } catch (_e) {
                costumeUrl = null;
            }
        }
        const scriptCount = target.blocks && typeof target.blocks.getScripts === 'function' ?
            target.blocks.getScripts().length :
            0;

        return {
            id: target.id,
            rawName,
            displayName,
            folder,
            isStage: Boolean(target.isStage),
            costumeUrl,
            scriptCount
        };
    });

    items.sort((a, b) => {
        if (a.isStage !== b.isStage) return a.isStage ? 1 : -1;
        return 0;
    });

    return items;
};

const placeWithoutOverlap = (payload, target, workspaceMetrics, isRtl) => {
    const metrics = workspaceMetrics && workspaceMetrics.targets ?
        workspaceMetrics.targets[target.id] :
        null;
    const placed = placeInViewport(payload, metrics, isRtl);
    const topBlock = findTopBlock(placed);
    if (!topBlock || !target || !target.blocks) return placed;

    const scriptIds = typeof target.blocks.getScripts === 'function' ?
        target.blocks.getScripts() :
        [];
    const existingCoords = scriptIds
        .map(id => getBlockFromContainer(target.blocks, id))
        .filter(Boolean)
        .map(b => ({x: Number(b.x) || 0, y: Number(b.y) || 0}));

    let candidateX = Number(topBlock.x) || 0;
    let candidateY = Number(topBlock.y) || 0;

    for (let step = 0; step < 30; step++) {
        const collides = existingCoords.some(pt => (
            Math.abs(pt.x - candidateX) < 36 &&
            Math.abs(pt.y - candidateY) < 36
        ));
        if (!collides) break;
        candidateX += 48;
        candidateY += 48;
    }

    topBlock.x = candidateX;
    topBlock.y = candidateY;
    return placed;
};

const sendScriptToTargets = async ({
    vm,
    fromTargetId,
    startBlockId,
    targetIds,
    workspaceMetrics,
    isRtl
}) => {
    if (!vm || !vm.runtime || !fromTargetId || !startBlockId || !Array.isArray(targetIds) || targetIds.length === 0) {
        return {sentCount: 0};
    }

    const fromTarget = vm.runtime.getTargetById(fromTargetId);
    if (!fromTarget || !fromTarget.blocks) {
        throw new Error('Исходный спрайт не найден');
    }

    const blockObjects = collectStandaloneBlocksForRoot(fromTarget.blocks, startBlockId);
    if (!blockObjects || blockObjects.length === 0) {
        throw new Error('Выбранный скрипт не найден');
    }

    const serialized = vm.exportStandaloneBlocks(blockObjects);

    // Send to non-stage sprites first, and stage last (so local->global variable promotion won't disturb earlier copies).
    const orderedTargetIds = targetIds.slice().sort((idA, idB) => {
        const tA = vm.runtime.getTargetById(idA);
        const tB = vm.runtime.getTargetById(idB);
        const stageA = tA && tA.isStage ? 1 : 0;
        const stageB = tB && tB.isStage ? 1 : 0;
        return stageA - stageB;
    });

    let sentCount = 0;
    for (const targetId of orderedTargetIds) {
        const target = vm.runtime.getTargetById(targetId);
        if (!target) continue;
        const payloadClone = JSON.parse(JSON.stringify(serialized));
        const placedPayload = placeWithoutOverlap(payloadClone, target, workspaceMetrics, isRtl);
        await vm.shareBlocksToTarget(placedPayload, targetId, fromTargetId);
        sentCount++;
    }

    if (typeof vm.emitTargetsUpdate === 'function') {
        vm.emitTargetsUpdate();
    }
    if (vm.editingTarget && orderedTargetIds.indexOf(vm.editingTarget.id) !== -1 && typeof vm.refreshWorkspace === 'function') {
        vm.refreshWorkspace();
    }

    return {sentCount};
};

export {
    setPendingSendScript,
    getPendingSendScript,
    clearPendingSendScript,
    collectStandaloneBlocksForRoot,
    countBlocksInStack,
    getTargetListForSend,
    sendScriptToTargets
};
