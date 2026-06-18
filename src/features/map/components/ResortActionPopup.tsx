"use client";

import { Box, Button, Flex } from "@chakra-ui/react";
import { Check, Plus } from "lucide-react";
import { Popup } from "react-leaflet";
import type { MapSkiResort } from "@/types/skiResorts";

type Props = {
  resort: MapSkiResort;
  isCompareSelected: boolean;
  onClose: () => void;
  onSelectResort: (id: string) => void;
  onToggleCompare?: (id: string, selected: boolean) => void;
};

export const ResortActionPopup = ({
  resort,
  isCompareSelected,
  onClose,
  onSelectResort,
  onToggleCompare,
}: Props) => (
  <Popup
    position={[resort.latitude, resort.longitude]}
    closeButton={false}
    autoPan={false}
    eventHandlers={{ remove: onClose }}
  >
    <Flex flexDirection="column" gap={2} minW="190px">
      <Box color="gray.900" fontSize="sm" fontWeight="800" lineHeight="1.35">
        {resort.nameJa}
      </Box>
      <Flex gap={2}>
        <Button
          size="xs"
          flex="1 1 0"
          minW={0}
          variant="outline"
          fontWeight="800"
          onClick={() => {
            onSelectResort(resort.id);
            onClose();
          }}
        >
          詳細を見る
        </Button>
        {onToggleCompare && (
          <Button
            size="xs"
            flex="1 1 0"
            minW={0}
            variant="outline"
            gap={1}
            fontWeight="800"
            color={isCompareSelected ? "white" : "brand.600"}
            bg={isCompareSelected ? "brand.500" : "white"}
            borderColor="brand.500"
            aria-pressed={isCompareSelected}
            _hover={{
              bg: isCompareSelected ? "brand.600" : "brand.50",
            }}
            onClick={() => {
              onToggleCompare(resort.id, !isCompareSelected);
              onClose();
            }}
          >
            <Box
              as={isCompareSelected ? Check : Plus}
              boxSize="14px"
              strokeWidth={3}
            />
            {isCompareSelected ? "比較から外す" : "比較に追加"}
          </Button>
        )}
      </Flex>
    </Flex>
  </Popup>
);
